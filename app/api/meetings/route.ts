import { meetingApiError, meetingRequestContext } from "../../../lib/server/meetings/route-service";
// meetingRequestContext calls the shared resolveIdentity boundary before any data access.

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const { identity, service } = await meetingRequestContext(request);
    const result = await service.create(identity, await request.json());
    return Response.json({ meetingId: result.meetingId, status: result.status }, { status: result.created ? 201 : 200 });
  } catch (error) { return meetingApiError(error); }
}
