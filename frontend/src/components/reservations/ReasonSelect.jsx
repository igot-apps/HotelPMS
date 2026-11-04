import { useState } from 'react';

const suggestions = {
  refund: ['Reservation was cancelled and a refund is due.', 'Guest departed early and the charges were corrected.', 'Guest paid more than the booking total.', 'Payment arrived after the room hold expired.'],
  'reject-correction': ['The requested correction is not appropriate for this booking.', 'Reservation details have changed. Please submit an updated request.', 'Please confirm the details with the guest before requesting this correction.'],
  'guest-cancel': ['My travel plans have changed.', 'I selected the wrong dates or room.', 'I made a duplicate reservation.', 'I no longer need accommodation.'],
  'undo-checkin': ['Checked in the wrong guest or room by mistake.', 'Guest has not arrived; check-in was recorded too early.', 'Check-in was recorded on the wrong reservation.'],
  'undo-checkout': ['Checked out the wrong guest or room by mistake.', 'Guest is still staying; checkout was recorded too early.'],
  restore: ['Cancelled the wrong reservation by mistake.', 'Guest confirmed they still need the reservation.'],
  'correct-date': ['Guest requested a longer stay.', 'Guest requested an earlier departure.', 'Departure date was entered incorrectly.'],
  transfer: ['Guest reported a maintenance problem.', 'Guest requested a different room.', 'Wrong room was assigned at check-in.'],
  'correct-payment': ['Payment amount was entered incorrectly.', 'Payment was recorded twice.', 'Payment was recorded against the wrong reservation.', 'Payment was recorded but no money was received.'],
  'credit-checkout': ['Manager approved payment after departure.', 'Company account will settle the outstanding balance.', 'Guest and manager agreed on a payment arrangement.'],
};

export default function ReasonSelect({ action, value, onChange, className, disabled }) {
  const [custom, setCustom] = useState(false);
  const options = suggestions[action] || ['Incorrect details were recorded.', 'Guest requested a change.'];
  const selected = custom || (value && !options.includes(value)) ? 'other' : value;
  return <div className="space-y-2">
    <label className="block text-sm text-text">Reason
      <select required value={selected} disabled={disabled} className={className} onChange={event => {
        setCustom(event.target.value === 'other');
        onChange(event.target.value === 'other' ? '' : event.target.value);
      }}>
        <option value="">Select a reason</option>
        {options.map(reason => <option key={reason} value={reason}>{reason}</option>)}
        <option value="other">Other — enter a custom reason</option>
      </select>
    </label>
    {selected === 'other' && <label className="block text-sm text-text">Custom reason
      <textarea required minLength={5} maxLength={500} value={value} disabled={disabled} onChange={event => onChange(event.target.value)} className={className} />
    </label>}
  </div>;
}
