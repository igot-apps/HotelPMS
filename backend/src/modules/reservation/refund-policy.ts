// Hotel refund policy. Non-refundable (the default) means a cancellation keeps the money: no refund
// becomes due. Staff can still record a refund as an explicit, audited exception.
export async function hotelIsNonRefundable(tx: any, propertyId: number): Promise<boolean> {
  const hotel = await tx.property.findUnique({ where: { propertyId }, select: { isNonRefundable: true } });
  return hotel?.isNonRefundable !== false;
}

// Money that becomes due back to the guest when a booking is cancelled.
export function cancellationRefund(paid: number, nonRefundable: boolean) {
  const refundDue = nonRefundable ? 0 : paid;
  return { refundDue, refundStatus: refundDue > 0 ? 'Pending' : 'None', refundPolicy: nonRefundable ? 'NonRefundable' : 'Refundable' };
}
