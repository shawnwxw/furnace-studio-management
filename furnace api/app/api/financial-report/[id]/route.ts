import { removeFinancialEntry, updateFinancialEntry } from '../financialLedger';

export const runtime = 'nodejs';

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return updateFinancialEntry(id, request);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return removeFinancialEntry(id, request);
}
