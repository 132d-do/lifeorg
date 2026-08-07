import { cycleApiError, cycleRequestContext } from "../../../../lib/server/cycles/route-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { identity, service } = await cycleRequestContext(request);
    return Response.json(await service.get(identity, id));
  } catch (error) { return cycleApiError(error); }
}

