import { cycleApiError, cycleRequestContext } from "../../../../lib/server/cycles/route-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { identity, service } = await cycleRequestContext(request);
    return Response.json({ cycle: await service.current(identity) });
  } catch (error) { return cycleApiError(error); }
}

