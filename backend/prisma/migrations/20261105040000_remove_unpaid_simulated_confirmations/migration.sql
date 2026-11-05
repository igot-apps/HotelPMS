DELETE FROM "simulated_sms" AS sms
USING "reservations" AS booking
WHERE sms."reservationId" = booking."reservationId"
  AND sms."kind" = 'confirmed'
  AND (
    booking."source" <> 'Website'
    OR booking."totalAmount" <= 0
    OR booking."amountPaid" + 0.01 < booking."totalAmount"
  );
