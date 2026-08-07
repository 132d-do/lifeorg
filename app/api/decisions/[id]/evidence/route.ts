import { decisionEvidenceApiError, decisionEvidenceRequestContext } from "../../../../../lib/server/evidence/route-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { identity, service } = await decisionEvidenceRequestContext(request);
    return Response.json(await service.list(identity, Number(id)));
  } catch (error) { return decisionEvidenceApiError(error); }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { identity, service } = await decisionEvidenceRequestContext(request);
    const result = await service.create(identity, Number(id), await request.json());
    return Response.json(result, { status: result.created ? 201 : 200 });
  } catch (error) { return decisionEvidenceApiError(error); }
}
