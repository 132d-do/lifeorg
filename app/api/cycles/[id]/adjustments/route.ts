import { cycleApiError, cycleRequestContext } from "../../../../../lib/server/cycles/route-service";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { identity, service } = await cycleRequestContext(request);
    return Response.json({ cycle: await service.adjust(identity, id, await request.json()) });
  } catch (error) { return cycleApiError(error); }
}

