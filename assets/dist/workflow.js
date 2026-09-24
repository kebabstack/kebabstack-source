// Presentation vocabulary. Payment and physical delivery are separate facts.
export const PHASES = [
  ['offer', 'Offer', 'Agree the sale'],
  ['invoice', 'Invoice', 'Confirm payment'],
  ['paid', 'Paid', 'Prepare & hand over'],
  ['complete', 'Complete', 'Hand-over recorded'],
  ['cancelled', 'Cancelled', 'Closed separately'],
];
export const phaseOf = (row) => row.phase || (row.sale.status === 'cancelled' ? 'cancelled' : row.sale.status === 'issued' ? 'invoice' : Number(row.handedOverAt) ? 'complete' : row.sale.status === 'paid' ? 'paid' : 'offer');
export function nextStep(row) {
  const s = row.sale || row;
  switch (phaseOf(row)) {
    case 'cancelled': return s.creditNoteNo ? 'Credit note issued' : 'No further action';
    case 'complete': return 'Handed over';
    case 'invoice': return 'Check incoming payment';
    case 'paid': return !s.wiped ? 'Wipe & test the device' : !s.mdmRemoved ? 'Finish MDM release' : 'Record hand-over';
    default: return s.status === 'accepted' ? 'Issue the invoice' : s.status === 'draft' ? 'Send the offer' : 'Waiting for the buyer';
  }
}
