export function errorResponse(error: unknown, status = 500): Response {
  return Response.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status },
  );
}
