"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChatContainer,
  ConversationHeader,
  MainContainer,
  Message,
  MessageInput,
  MessageList,
  TypingIndicator,
} from "@chatscope/chat-ui-kit-react";

// labels is optional: only /api/issues sends it (the routing verdict on the
// card); solved/autofixed entries carry their lane as the badge instead.
type Issue = { number: number; title: string; url: string; labels?: string[] };
type PrRef = { number: number; title?: string; url: string };
type AutofixedEntry = { issue: Issue; pr: PrRef };
// The two lanes, as recorded on GitHub: the `autofixed` label present or not.
type Badge = "autofixed" | "human-approved";
type SolvedEntry = { issue: Issue; pr: PrRef; badge: Badge };

// One state per card, one direction: a failed merge parks the card (recovery
// is the runbook, not a retry button).
type PrCardState = "ready" | "merging" | "merged" | "failed";

type ChatMessage =
  | { id: number; kind: "user"; text: string }
  | { id: number; kind: "bot"; text: string; chips?: boolean }
  | { id: number; kind: "autofixed"; entries: AutofixedEntry[] }
  | { id: number; kind: "solved"; entries: SolvedEntry[] }
  | { id: number; kind: "issues"; issues: Issue[] }
  | {
      id: number;
      kind: "pr";
      issue: Issue;
      prNumber: number;
      prUrl: string;
      state: PrCardState;
    };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

// Exactly one vocabulary: the three commands partition the story, and the
// old Stage 2 names fall through to the graceful fallback — no silent aliases.
const CMD_ISSUES = "/issues";
const CMD_SOLVED = "/solved";
const CMD_AUTOFIXED = "/autofixed";

const WELCOME =
  "Hi! I run the bug-fix pipeline. Three commands: " +
  `${CMD_ISSUES} — the open queue, waiting to be dispatched; ` +
  `${CMD_SOLVED} — every fixed bug, badged by who was in the loop; ` +
  `${CMD_AUTOFIXED} — the fixes that shipped with no human in the loop.`;

export default function Home() {
  const nextId = useRef(1);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 0, kind: "bot", text: WELCOME, chips: true },
  ]);
  // One run at a time against the shared checkout: while a dispatch or merge
  // is in flight, every Fix-this and Merge button is disabled.
  const [inFlight, setInFlight] = useState(false);
  const [activeIssue, setActiveIssue] = useState<number | null>(null);
  const [dispatchedIssues, setDispatchedIssues] = useState<Set<number>>(new Set());
  // Fix-this expands the card in place to an optional note field + Dispatch;
  // one card expanded at a time, draft discarded when expansion moves on.
  const [expandedIssue, setExpandedIssue] = useState<number | null>(null);
  const [noteDraft, setNoteDraft] = useState("");
  // The replay banner renders from the server's mode exposure (the same
  // switch every dispatch path obeys): visible whenever replay is on, so the
  // presentation never claims live generation it isn't doing (ADR-0004).
  const [replayMode, setReplayMode] = useState(false);

  useEffect(() => {
    let cancelled = false;
    // The banner is the honesty device: a fetch that loses a race with the
    // server's startup must retry, never silently leave replay unannounced.
    const learnMode = () => {
      fetch("/api/config")
        .then((res) => res.json())
        .then((cfg: { replay?: boolean }) => {
          if (!cancelled) setReplayMode(Boolean(cfg.replay));
        })
        .catch(() => {
          if (!cancelled) setTimeout(learnMode, 3000);
        });
    };
    learnMode();
    return () => {
      cancelled = true;
    };
  }, []);

  function add(msg: DistributiveOmit<ChatMessage, "id">) {
    const id = nextId.current++;
    setMessages((prev) => [...prev, { ...msg, id } as ChatMessage]);
    return id;
  }

  const addBot = (text: string, chips = false) => add({ kind: "bot", text, chips });

  function setPrCardState(id: number, state: PrCardState) {
    setMessages((prev) =>
      prev.map((m) => (m.id === id && m.kind === "pr" ? { ...m, state } : m)),
    );
  }

  async function fetchJson(url: string, init?: RequestInit) {
    const res = await fetch(url, init);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? `request failed (${res.status})`);
    return data;
  }

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  // The blocking dispatch request is the primary channel. A proxy between the
  // browser and the backend (e.g. Codespaces port forwarding, which caps
  // requests at ~100s) can kill it mid-run while the run keeps going
  // server-side — so on a transport-level failure we recover the outcome by
  // polling the status route. A localhost demo never takes this path.
  async function dispatchAndAwait(
    issue: number,
    note?: string,
  ): Promise<{ prUrl: string; prNumber: number }> {
    let res: Response;
    try {
      res = await fetch("/api/dispatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(note ? { issue, note } : { issue }),
      });
    } catch {
      return awaitViaStatus(issue);
    }
    const data = await res.json().catch(() => null);
    if (res.ok) return data;
    if (data?.error) throw new Error(data.error); // the backend itself answered
    return awaitViaStatus(issue); // a proxy answered (504 and friends)
  }

  async function awaitViaStatus(issue: number): Promise<{ prUrl: string; prNumber: number }> {
    for (let attempt = 0; attempt < 240; attempt++) {
      await sleep(5000);
      let outcome;
      try {
        outcome = await fetchJson("/api/dispatch-status");
      } catch {
        continue; // transient hiccup on the recovery channel — keep polling
      }
      if (outcome.status === "running" && outcome.issue === issue) continue;
      if (outcome.status === "done" && outcome.issue === issue) {
        return { prUrl: outcome.prUrl, prNumber: outcome.prNumber };
      }
      if (outcome.status === "failed" && outcome.issue === issue) {
        throw new Error(outcome.error);
      }
      throw new Error("lost track of the run — check GitHub for the PR before retrying");
    }
    throw new Error("gave up waiting for the run — check GitHub for the PR before retrying");
  }

  async function listAutofixed() {
    try {
      const { autofixed } = await fetchJson("/api/autofixed");
      if (autofixed.length === 0) {
        addBot("The autofix lane is empty — nothing merged without a human yet.", true);
      } else {
        add({ kind: "autofixed", entries: autofixed });
      }
    } catch (error) {
      addBot(`Something went wrong listing autofixed issues: ${(error as Error).message}`);
    }
  }

  async function listSolved() {
    try {
      const { solved } = await fetchJson("/api/solved");
      if (solved.length === 0) {
        addBot("Nothing solved yet this cycle.", true);
      } else {
        add({ kind: "solved", entries: solved });
      }
    } catch (error) {
      addBot(`Something went wrong listing solved issues: ${(error as Error).message}`);
    }
  }

  async function listIssues() {
    try {
      const { issues } = await fetchJson("/api/issues");
      if (issues.length === 0) {
        addBot("No open issues — the queue is clear.", true);
      } else {
        add({ kind: "issues", issues });
      }
    } catch (error) {
      addBot(`Something went wrong listing open issues: ${(error as Error).message}`);
    }
  }

  function handleCommand(raw: string) {
    const text = raw.trim();
    if (!text) return;
    add({ kind: "user", text });
    if (text === CMD_ISSUES) {
      void listIssues();
    } else if (text === CMD_SOLVED) {
      void listSolved();
    } else if (text === CMD_AUTOFIXED) {
      void listAutofixed();
    } else {
      addBot("I only speak three commands — pick one:", true);
    }
  }

  // Dispatch blocks until the runner exits; the open request is the
  // notification channel, so the PR card lands at the true moment of readiness.
  async function handleDispatch(issue: Issue) {
    // Empty-only normalization, mirrored server-side: an empty field
    // dispatches exactly as before the note existed — no trace anywhere.
    const note = noteDraft.trim() || undefined;
    setExpandedIssue(null);
    setNoteDraft("");
    setInFlight(true);
    setActiveIssue(issue.number);
    addBot(
      `On it — dispatching the fixer agent on issue #${issue.number}` +
        (note ? " with your note on the record. " : ". ") +
        "I'll post the PR here the moment it's ready.",
    );
    try {
      const { prUrl, prNumber } = await dispatchAndAwait(issue.number, note);
      setDispatchedIssues((prev) => new Set(prev).add(issue.number));
      add({ kind: "pr", issue, prNumber, prUrl, state: "ready" });
    } catch (error) {
      addBot(`The run for issue #${issue.number} failed: ${(error as Error).message}`);
    } finally {
      setInFlight(false);
      setActiveIssue(null);
    }
  }

  async function handleMerge(msgId: number, prNumber: number) {
    setInFlight(true);
    setPrCardState(msgId, "merging");
    try {
      await fetchJson("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pr: prNumber }),
      });
      setPrCardState(msgId, "merged");
      addBot(
        `Merged PR #${prNumber}. The local checkout is synced — ` +
          "the app reloads with the fix, so redo the gesture and the bug is gone.",
      );
    } catch (error) {
      setPrCardState(msgId, "failed");
      addBot(`The merge of PR #${prNumber} failed: ${(error as Error).message}`);
    } finally {
      setInFlight(false);
    }
  }

  function CommandChips() {
    return (
      <div className="chip-row">
        {[CMD_ISSUES, CMD_SOLVED, CMD_AUTOFIXED].map((cmd) => (
          <button className="chip" key={cmd} onClick={() => handleCommand(cmd)}>
            {cmd}
          </button>
        ))}
      </div>
    );
  }

  // The routing verdict, worn on the card: the problem-class label (the
  // precedent ledger's unit) and needs-human when the class is novel. Other
  // labels stay off the chat — GitHub renders the full record.
  function RoutingBadges({ labels }: { labels?: string[] }) {
    const routing = (labels ?? []).filter(
      (label) => label.startsWith("class:") || label === "needs-human",
    );
    return (
      <>
        {routing.map((label) => (
          <span
            key={label}
            className={`badge ${label === "needs-human" ? "badge-needs-human" : "badge-class"}`}
          >
            {label}
          </span>
        ))}
      </>
    );
  }

  function renderContent(msg: ChatMessage) {
    switch (msg.kind) {
      case "user":
      case "bot":
        return (
          <>
            {msg.text}
            {msg.kind === "bot" && msg.chips && <CommandChips />}
          </>
        );
      case "autofixed":
        return (
          <>
            Fixed with no human in the loop — every link is the real GitHub record:
            {msg.entries.map(({ issue, pr }) => (
              <div className="card" key={pr.number}>
                <div className="card-title">
                  #{issue.number} {issue.title}
                </div>
                <div className="card-links">
                  <a href={issue.url} target="_blank" rel="noreferrer">
                    issue #{issue.number} (closed)
                  </a>
                  <a href={pr.url} target="_blank" rel="noreferrer">
                    PR #{pr.number} (merged)
                  </a>
                </div>
              </div>
            ))}
          </>
        );
      case "solved":
        return (
          <>
            Everything solved so far — the badge says who was in the loop, the
            links are the receipts:
            {msg.entries.map(({ issue, pr, badge }) => (
              <div className="card" key={pr.number}>
                <div className="card-title">
                  #{issue.number} {issue.title}
                  <span className={`badge badge-${badge}`}>{badge}</span>
                </div>
                <div className="card-links">
                  <a href={issue.url} target="_blank" rel="noreferrer">
                    issue #{issue.number} (closed)
                  </a>
                  <a href={pr.url} target="_blank" rel="noreferrer">
                    PR #{pr.number} (merged)
                  </a>
                </div>
              </div>
            ))}
          </>
        );
      case "issues":
        return (
          <>
            In the queue — dispatch one and I&apos;ll take a shot at it:
            {msg.issues.map((issue) => (
              <div className="card" key={issue.number}>
                <div className="card-title">
                  #{issue.number} {issue.title}
                  <RoutingBadges labels={issue.labels} />
                </div>
                <div className="card-links">
                  <a href={issue.url} target="_blank" rel="noreferrer">
                    view issue
                  </a>
                </div>
                {expandedIssue === issue.number && !dispatchedIssues.has(issue.number) ? (
                  <div className="note-form">
                    <textarea
                      className="note-field"
                      rows={3}
                      placeholder="Optional note for the fixer agent — anything only the team knows. Leave empty to dispatch as-is."
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      disabled={inFlight}
                    />
                    <button
                      className="btn"
                      disabled={inFlight}
                      onClick={() => handleDispatch(issue)}
                    >
                      Dispatch
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn"
                    disabled={inFlight || dispatchedIssues.has(issue.number)}
                    onClick={() => {
                      setExpandedIssue(issue.number);
                      setNoteDraft("");
                    }}
                  >
                    {activeIssue === issue.number
                      ? "Working on it…"
                      : dispatchedIssues.has(issue.number)
                        ? "PR ready — see below"
                        : "Fix this"}
                  </button>
                )}
              </div>
            ))}
          </>
        );
      case "pr":
        return (
          <div className="card">
            <div className="card-title">
              PR #{msg.prNumber} ready for issue #{msg.issue.number}
            </div>
            <div className="card-links">
              <a href={`${msg.prUrl}/files`} target="_blank" rel="noreferrer">
                view diff
              </a>
              <a href={msg.prUrl} target="_blank" rel="noreferrer">
                view PR
              </a>
              <a
                href={`/api/trace/${msg.issue.number}`}
                target="_blank"
                rel="noreferrer"
              >
                view trace
              </a>
            </div>
            {msg.state === "merged" ? (
              <div className="card-status">Merged — live in the app.</div>
            ) : msg.state === "failed" ? (
              <div className="card-status">Merge failed — recover via the runbook.</div>
            ) : (
              <button
                className="btn"
                disabled={inFlight || msg.state !== "ready"}
                onClick={() => handleMerge(msg.id, msg.prNumber)}
              >
                {msg.state === "merging" ? "Merging…" : "Merge"}
              </button>
            )}
          </div>
        );
    }
  }

  return (
    <main className="chat-shell">
      {replayMode && (
        <div className="replay-banner">
          Replaying certified agent runs — the agent output in this walkthrough
          was generated and certified in earlier live runs; routing, PRs,
          gates, and merges are happening live.
        </div>
      )}
      <MainContainer>
        <ChatContainer>
          <ConversationHeader>
            <ConversationHeader.Content
              userName="Pipeline Bot"
              info="bug-fix pipeline — issues and PRs live on GitHub"
            />
          </ConversationHeader>
          <MessageList
            typingIndicator={
              inFlight ? <TypingIndicator content="Fixer agent is working" /> : undefined
            }
          >
            {messages.map((msg) => (
              <Message
                key={msg.id}
                model={{
                  type: "custom",
                  position: "single",
                  direction: msg.kind === "user" ? "outgoing" : "incoming",
                }}
              >
                <Message.CustomContent>{renderContent(msg)}</Message.CustomContent>
              </Message>
            ))}
          </MessageList>
          <MessageInput
            placeholder={`Type ${CMD_ISSUES}, ${CMD_SOLVED}, or ${CMD_AUTOFIXED}`}
            attachButton={false}
            onSend={(_html, textContent) => handleCommand(textContent)}
          />
        </ChatContainer>
      </MainContainer>
    </main>
  );
}
