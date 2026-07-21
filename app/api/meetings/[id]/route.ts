import { meetingApiError, meetingRequestContext } from "../../../../lib/server/meetings/route-service";
// meetingRequestContext calls the shared resolveIdentity boundary before any data access.

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { identity, service } = await meetingRequestContext(request);
    return Response.json({ meeting: await service.get(identity, id) });
  } catch (error) { return meetingApiError(error); }
}
