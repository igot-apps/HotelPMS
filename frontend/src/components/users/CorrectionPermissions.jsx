import { useState, useEffect, useRef } from 'react';
import FinancialDelegationSettings, { financialOptions } from './FinancialDelegationSettings';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/axios';
import toast from 'react-hot-toast';
const roomCorrections = ['undo-checkin', 'undo-checkout', 'restore', 'transfer'];

export default function CorrectionPermissions({ user, onClose }) {
  const section = useRef(null);
  useEffect(() => { section.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); section.current?.focus({ preventScroll: true }); }, []);
  const [financial, setFinancial] = useState(user.financialDelegation || {});
  const [confirming, setConfirming] = useState(false);
  const [managerPassword, setManagerPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [validation, setValidation] = useState('');
  const increased = Object.entries(financial).some(([action, limit]) => Number(limit) > Number(user.financialDelegation?.[action] || 0));
  const save = () => {
    if (Object.values(financial).some(limit => !Number.isFinite(Number(limit)) || Number(limit) <= 0 || Number(limit) > 99999999.99 || Math.round(Number(limit) * 100) / 100 !== Number(limit))) { setValidation('Enter a positive limit with at most two decimal places for every delegated action.'); return; }
    setValidation('');
    if (increased) { setConfirming(true); return; }
    mutation.mutate();
  };
  const client = useQueryClient();
  const mutation = useMutation({ mutationFn: () => api.put(`/users/${user.userId}/correction-permissions`, { permissions: roomCorrections, financialDelegation: Object.fromEntries(Object.entries(financial).map(([action, limit]) => [action, Number(limit)])), managerPassword, confirmDelegation: confirmed }), onSuccess: () => { client.invalidateQueries({ queryKey: ['users'] }); client.invalidateQueries({ queryKey: ['correctionAccess'] }); toast.success('Approval requirements updated.'); onClose(); }, onError: e => toast.error(e.response?.data?.message || 'Could not save approval requirements.') });
  return <section ref={section} tabIndex={-1} aria-label={`Approval requirements for ${user.fullName}`} className="scroll-mt-4 min-w-0 space-y-4 rounded-xl border border-primary-200 bg-surface p-4 sm:p-6">
    <div><h2 className="text-lg font-bold text-text">Actions requiring manager approval</h2><p className="mt-1 break-words text-sm text-text-muted">For {user.fullName}</p></div>
    <p className="text-sm text-text-muted">Receptionists can handle room corrections directly. Set approval requirements for financial actions below.</p>
    <FinancialDelegationSettings value={financial} disabled={mutation.isPending || confirming} onChange={value => { setFinancial(value); setManagerPassword(''); setConfirmed(false); setValidation(''); }} />
    {validation && <p role="alert" className="text-sm text-danger-700">{validation}</p>}
    {confirming && <form onSubmit={e => { e.preventDefault(); if (confirmed && !mutation.isPending) mutation.mutate(); }} className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4"><h3 className="font-bold text-amber-900">Confirm financial delegation</h3><p className="text-sm text-amber-900">{user.fullName} will be able to apply these actions without approval. Review the limits carefully. Every correction requires a reason and remains in the daily activity and history.</p><ul className="list-disc space-y-2 pl-5 text-sm text-amber-900">{financialOptions.filter(([action]) => Object.hasOwn(financial, action)).map(([action, label]) => <li key={action}>{label}: up to GHS {Number(financial[action]).toFixed(2)}</li>)}</ul><label className="flex min-h-11 items-center gap-3 text-sm text-text"><input required type="checkbox" checked={confirmed} disabled={mutation.isPending} onChange={e => setConfirmed(e.target.checked)} />I trust this receptionist with these financial limits.</label><label className="block text-sm text-text">Your manager password<input required type="password" autoComplete="current-password" value={managerPassword} disabled={mutation.isPending} onChange={e => setManagerPassword(e.target.value)} className="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-border p-2" /></label><div className="flex flex-wrap gap-2"><button disabled={!confirmed || !managerPassword || mutation.isPending} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Confirm and save'}</button><button type="button" disabled={mutation.isPending} onClick={() => { setConfirming(false); setManagerPassword(''); setConfirmed(false); }} className="min-h-11 rounded-lg border border-border px-4 py-2 text-text">Back to edit</button></div></form>}
    {!confirming && <div className="flex flex-wrap gap-2"><button disabled={mutation.isPending} onClick={save} className="min-h-11 rounded-lg bg-primary-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{mutation.isPending ? 'Saving…' : 'Save approval requirements'}</button><button disabled={mutation.isPending} onClick={onClose} className="min-h-11 rounded-lg border border-border px-4 py-2 text-text">Cancel</button></div>}
  </section>;
}
