import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { addWebsiteDomain, checkWebsiteDomain, getWebsiteDomains, removeWebsiteDomain, setWebsiteDomainActive, setWebsiteDomainAutoActivate } from '../../api/platformProperties';

function DomainDnsInstructions({ hostname, frontendHost }) {
  const labels = hostname.split('.');
  const isRoot = labels.length === 2;
  const records = isRoot
    ? [
      { type: 'A Record', host: '@', value: '216.24.57.1' },
      { type: 'CNAME Record', host: 'www', value: frontendHost },
    ]
    : [{ type: 'CNAME Record', host: labels.slice(0, -2).join('.'), value: frontendHost }];

  return <div className="mt-4 rounded-lg border border-border bg-background p-3">
    <p className="text-sm font-semibold text-text">DNS records to add</p>
    <p className="mt-1 text-xs leading-5 text-text-muted">At the domain’s DNS provider, replace any parking or redirect records for these hosts with the records below.</p>
    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[440px] text-left text-sm">
        <thead className="bg-secondary-50 text-text-muted"><tr><th scope="col" className="px-3 py-2">Type</th><th scope="col" className="px-3 py-2">Host</th><th scope="col" className="px-3 py-2">Value</th></tr></thead>
        <tbody>{records.map(record => <tr key={record.host} className="border-t border-border"><td className="px-3 py-2 font-medium text-text">{record.type}</td><td className="px-3 py-2 font-mono text-text">{record.host}</td><td className="break-all px-3 py-2 font-mono text-text">{record.value}</td></tr>)}</tbody>
      </table>
    </div>
    <p className="mt-3 text-xs leading-5 text-text-muted">Before changing DNS, confirm these targets in <a href="https://render.com/docs/custom-domains" target="_blank" rel="noreferrer" className="font-semibold text-primary-700 underline">Render’s current instructions</a> for {hostname}. Render may update its IP or add verification steps. After saving DNS, select <strong>Check status</strong> here.</p>
  </div>;
}

export default function WebsiteDomainsDialog({ property, onClose }) {
  const [hostname, setHostname] = useState('');
  const [checks, setChecks] = useState({});
  const client = useQueryClient();
  const queryKey = ['websiteDomains', property.propertyId];
  const { data, isLoading, isError } = useQuery({ queryKey, queryFn: async () => (await getWebsiteDomains(property.propertyId)).data.data });
  const refresh = () => client.invalidateQueries({ queryKey });
  const add = useMutation({ mutationFn: () => addWebsiteDomain(property.propertyId, hostname.trim().toLowerCase()), onSuccess: () => { setHostname(''); refresh(); toast.success('Domain added to Render. Add the DNS record below, then check its status.'); }, onError: error => toast.error(error.response?.data?.message || 'Could not add domain.') });
  const check = useMutation({ mutationFn: domainId => checkWebsiteDomain(property.propertyId, domainId), onSuccess: (response, domainId) => { setChecks(previous => ({ ...previous, [domainId]: response.data.data })); if (response.data.data.isActive) refresh(); }, onError: error => toast.error(error.response?.data?.message || 'Could not check domain.') });
  const toggle = useMutation({ mutationFn: ({ domainId, isActive }) => setWebsiteDomainActive(property.propertyId, domainId, isActive), onSuccess: () => { refresh(); toast.success('Website status updated.'); }, onError: error => toast.error(error.response?.data?.message || 'Could not update domain.') });
  const auto = useMutation({ mutationFn: ({ domainId, autoActivate }) => setWebsiteDomainAutoActivate(property.propertyId, domainId, autoActivate), onSuccess: () => { refresh(); toast.success('Automatic activation setting saved.'); }, onError: error => toast.error(error.response?.data?.message || 'Could not update automatic activation.') });
  const remove = useMutation({ mutationFn: domainId => removeWebsiteDomain(property.propertyId, domainId), onSuccess: () => { refresh(); toast.success('Domain removed from HideOut24 and Render.'); }, onError: error => toast.error(error.response?.data?.message || 'Could not remove domain.') });
  const subdomain = data?.subdomain;

  return <div className="mobile-dialog-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-6" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="website-domains-title" className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-surface p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><h2 id="website-domains-title" className="flex items-center gap-2 text-xl font-bold text-text"><Globe2 size={22} className="text-primary-600" /> Hotel website</h2><p className="mt-1 text-sm text-text-muted">{property.propertyName}</p></div><button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-text-muted hover:bg-secondary-100"><X size={20} /></button></div>
      {isLoading ? <p className="mt-6 text-sm text-text-muted">Loading website addresses…</p> : isError ? <p className="mt-6 text-sm text-danger-600">Could not load website addresses.</p> : <div className="mt-6 space-y-6">
        <div className="rounded-xl border border-primary-100 bg-primary-50 p-4"><p className="text-sm font-semibold text-text">Included HideOut24 address</p>{subdomain ? <><a href={`https://${subdomain}`} target="_blank" rel="noreferrer" className="mt-1 inline-flex break-all text-sm font-semibold text-primary-700 underline"><span>{subdomain}</span><ExternalLink size={14} className="ml-1 shrink-0" /></a><p className="mt-2 text-xs text-text-muted">Available when online booking is enabled and the HideOut24 wildcard DNS and Render domain are connected.</p></> : <p className="mt-2 text-sm text-text-muted">This hotel code cannot be used as a subdomain. Change its code to a valid URL slug.</p>}</div>
        <div><h3 className="font-semibold text-text">Hotel-owned domain</h3><p className="mt-1 text-sm text-text-muted">Add a domain owned by the hotel. HideOut24 checks DNS and HTTPS before it can go live.</p>
          <form onSubmit={event => { event.preventDefault(); if (hostname.trim()) add.mutate(); }} className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Hotel domain" value={hostname} onChange={event => setHostname(event.target.value)} placeholder="royalhotel.com" autoCapitalize="none" autoComplete="off" spellCheck="false" className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-2.5 text-text outline-none focus:border-primary-500" /><button disabled={add.isPending || !hostname.trim()} className="rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white disabled:opacity-50">Add domain</button></form>
          <div className="mt-4 space-y-2">{data?.domains?.length ? data.domains.map(domain => <div key={domain.domainId} className="rounded-xl border border-border p-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><span className="block break-all font-semibold text-text">{domain.hostname}</span><span className={`text-xs font-semibold ${domain.isActive ? 'text-success-700' : 'text-warning-700'}`}>{domain.isActive ? 'Live' : checks[domain.domainId]?.status === 'securing_website' ? 'Securing website' : 'Waiting for DNS'}</span></div><div className="flex flex-wrap gap-2"><button type="button" disabled={check.isPending} onClick={() => check.mutate(domain.domainId)} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary-700 disabled:opacity-50">Check status</button><button type="button" disabled={toggle.isPending || (!domain.isActive && !checks[domain.domainId]?.ready)} onClick={() => toggle.mutate({ domainId: domain.domainId, isActive: !domain.isActive })} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-primary-700 disabled:opacity-50">{domain.isActive ? 'Pause' : 'Go live'}</button><button type="button" disabled={remove.isPending} onClick={() => { if (window.confirm(`Remove ${domain.hostname} from this hotel and Render?`)) remove.mutate(domain.domainId); }} className="rounded-lg border border-border px-3 py-2 text-sm font-semibold text-danger-600 disabled:opacity-50">Remove</button></div></div><label className="mt-3 flex cursor-pointer items-start gap-3 rounded-lg bg-secondary-50 p-3 text-sm text-text"><input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-600" checked={domain.autoActivate} disabled={auto.isPending || domain.isActive} onChange={event => auto.mutate({ domainId: domain.domainId, autoActivate: event.target.checked })} /><span><strong>Go live automatically when ready</strong><span className="mt-0.5 block text-xs text-text-muted">Checks DNS and HTTPS every few minutes. Turn off to review and activate manually.</span></span></label><DomainDnsInstructions hostname={domain.hostname} frontendHost={data.frontendHost} />{checks[domain.domainId] && <p className="mt-2 text-sm text-text-muted" role="status">{checks[domain.domainId].message}</p>}</div>) : <p className="rounded-lg border border-dashed border-border p-4 text-sm text-text-muted">No hotel-owned domain added yet.</p>}</div>
        </div>
      </div>}
    </section>
  </div>;
}
