import { cycleApiError, cycleRequestContext } from "../../../lib/server/cycles/route-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { identity, service } = await cycleRequestContext(request);
    return Response.json({ cycles: await service.list(identity) });
  } catch (error) { return cycleApiError(error); }
}

export async function POST(request: Request) {
  try {
    const { identity, service } = await cycleRequestContext(request);
    const result = await service.create(identity, await request.json());
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) { return cycleApiError(error); }
}

