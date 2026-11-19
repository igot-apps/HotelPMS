import { useLayoutEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  AlarmClock, ArrowRight, BedDouble, Building2, CalendarCheck2, ChartNoAxesCombined,
  Hotel, LayoutGrid, LogIn, LogOut, Plus, Search, ShieldCheck, Sparkles, UserCheck, Users, Wallet,
} from 'lucide-react';
import PublicNavbar from '../components/public/PublicNavbar';
import BackButton from '../components/ui/BackButton';

const glanceTiles = [
  { icon: LogIn, label: 'Arrivals to check in', value: '6', hint: '4 arrived today · 3 unpaid', tone: 'primary' },
  { icon: LogOut, label: 'Departures to check out', value: '4', hint: '2 checked out today', tone: 'warning' },
  { icon: Hotel, label: 'Guests in house', value: '28', hint: '22 of 30 rooms taken tonight', tone: 'primary' },
  { icon: BedDouble, label: 'Rooms free tonight', value: '8', hint: '73% occupancy', tone: 'success' },
  { icon: AlarmClock, label: 'Overdue checkouts', value: '1', hint: '35 minutes late', tone: 'danger' },
  { icon: Sparkles, label: 'Needs attention', value: '3', hint: '2 to clean · 1 maintenance', tone: 'warning' },
];

const quickActions = [
  { icon: Plus, label: 'New booking' },
  { icon: Search, label: 'See free rooms' },
  { icon: CalendarCheck2, label: 'Reservations & payments' },
  { icon: BedDouble, label: 'Rooms & housekeeping' },
];

const features = [
  { icon: LayoutGrid, title: 'Today at a glance', description: 'Arrivals, departures, in-house guests, free rooms, money taken, and rooms needing attention — one screen, no digging.' },
  { icon: CalendarCheck2, title: 'Reservations in one place', description: 'Track bookings, arrivals, departures, balances, and guest details from a single workspace.' },
  { icon: BedDouble, title: 'Rooms and housekeeping', description: 'See what is free, what is dirty, and what is under maintenance, then update room status as the shift moves.' },
  { icon: Wallet, title: 'Payments and balances', description: 'Know what was collected today, which in-house guests still owe, and who left without settling.' },
  { icon: ChartNoAxesCombined, title: 'A public booking page', description: 'Give guests a simple way to discover your property and book directly online.' },
  { icon: Users, title: 'A team for your property', description: 'Invite receptionists and cleaners, with access suited to the work they actually do.' },
];

const shiftFlow = [
  { step: '01', title: 'Start of shift', description: 'Open the front desk view to see today’s arrivals, departures, and anything overdue.' },
  { step: '02', title: 'At the desk', description: 'Search a guest, take a payment, check someone in, or mark a room clean without leaving the page.' },
  { step: '03', title: 'End of shift', description: 'See what you handled today and what the next shift needs to pick up.' },
];

export default function ForHotelsPage() {
  const { key } = useLocation();
  useLayoutEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [key]);

  return (
    <div className="min-h-screen bg-background text-text">
      <PublicNavbar />
      <div className="mx-auto w-full max-w-7xl px-4 py-3 md:hidden">
        <BackButton fallback="/discover" label="Back" />
      </div>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-secondary-900">
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black,transparent_78%)]" />
          <div className="pointer-events-none absolute -left-24 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-[30rem] w-[30rem] rounded-full bg-emerald-300/10 blur-3xl" />

          <div className="relative mx-auto grid max-w-7xl gap-14 px-5 py-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center lg:py-24">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white">
                <Building2 size={16} /> HideOut24 for hotels
              </div>
              <h1 className="mt-6 max-w-2xl text-4xl font-black leading-[1.05] tracking-tight text-white sm:text-5xl lg:text-6xl">
                Your front desk,<br className="hidden sm:block" /> all in one place.
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-white/80">
                The same clear view your reception team opens every morning: who is arriving, who is leaving,
                which rooms are free tonight, and what needs attention — before a guest reaches the desk.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register-your-hotel" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-primary-800 shadow-lg transition hover:bg-primary-50">
                  Register your hotel <ArrowRight size={18} />
                </Link>
                <Link to="/hotel/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/15">
                  Hotel staff sign in
                </Link>
              </div>
              <div className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm text-white/70">
                <span className="inline-flex items-center gap-2"><ShieldCheck size={17} /> Your property data stays in your workspace</span>
                <span className="hidden h-1 w-1 rounded-full bg-white/30 sm:block" />
                <span>Built for managers and receptionists</span>
              </div>
            </div>

            {/* Live product preview — mirrors the actual front desk dashboard */}
            <div className="relative">
              <div className="absolute -inset-4 rounded-[2rem] bg-gradient-to-br from-white/15 to-transparent blur-2xl" aria-hidden="true" />
              <div className="relative rounded-2xl border border-white/20 bg-white/10 p-2 shadow-2xl backdrop-blur-sm sm:p-3">
                <div className="overflow-hidden rounded-xl bg-surface shadow-xl">
                  {/* Preview window bar */}
                  <div className="flex items-center justify-between gap-3 border-b border-border bg-secondary-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary-600 text-white"><Building2 size={13} /></span>
                      <span className="text-xs font-bold text-text">HideOut24</span>
                      <span className="hidden rounded-md border border-border bg-white px-2 py-0.5 text-[10px] font-semibold text-text-muted sm:inline">Front desk</span>
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-success-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-success-500" /> Live
                    </span>
                  </div>

                  <div className="space-y-3 p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-primary-700">Palm Court Hotel</p>
                        <p className="text-base font-bold leading-tight text-text">Good morning, Ama</p>
                        <p className="mt-0.5 text-[11px] text-text-muted">Tuesday, 19 November · Your front desk at a glance</p>
                      </div>
                      <span className="hidden shrink-0 items-center gap-1 rounded-lg border border-border bg-white px-2 py-1 text-[10px] font-semibold text-text-muted sm:inline-flex">
                        <UserCheck size={12} /> Receptionist
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-text">Today at a glance</p>
                      <p className="text-[10px] text-text-muted">Updated 9:41 AM</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {glanceTiles.map(({ icon: Icon, label, value, hint, tone }) => <PreviewTile key={label} icon={Icon} label={label} value={value} hint={hint} tone={tone} />)}
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-success-100 bg-success-50/60 px-3 py-2">
                      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-success-700"><Wallet size={13} /> Collected today</p>
                      <p className="text-xs font-bold text-text">GHS 4,820.00</p>
                      <p className="w-full text-[10px] text-text-muted sm:w-auto">3,300 at the desk · 1,520 online · 6 payments</p>
                    </div>

                    <div>
                      <p className="mb-1.5 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-text-muted"><LayoutGrid size={12} /> Quick actions</p>
                      <div className="grid grid-cols-2 gap-1.5">
                        {quickActions.map(({ icon: Icon, label }) => (
                          <span key={label} className="inline-flex items-center gap-1.5 rounded-md border border-border bg-white px-2 py-1.5 text-[10px] font-semibold text-text">
                            <Icon size={12} className="shrink-0 text-primary-600" /> {label}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-lg border border-border bg-background px-3 py-2">
                      <p className="flex items-center gap-1.5 text-[10px] font-bold text-text"><UserCheck size={12} className="text-primary-600" /> You today</p>
                      <div className="mt-1.5 grid grid-cols-3 gap-2 text-[10px]">
                        <PreviewStat label="Checked in" value="4 bookings" />
                        <PreviewStat label="Checked out" value="3 bookings" />
                        <PreviewStat label="Money taken" value="GHS 1,250" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-primary-700">Made for hotel teams</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">The essentials to keep each shift moving</h2>
            <p className="mt-4 text-text-muted">Manage the guest journey from booking through checkout without losing track of the details.</p>
          </div>
          <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="group rounded-2xl border border-border bg-surface p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md">
                <div className="inline-flex rounded-xl bg-primary-50 p-3 text-primary-700 transition group-hover:bg-primary-600 group-hover:text-white"><Icon size={22} /></div>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Shift flow */}
        <section className="border-y border-border bg-surface">
          <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
            <div className="max-w-2xl">
              <p className="text-sm font-bold uppercase tracking-widest text-primary-700">Built around the desk</p>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">One workspace, from handover to handover</h2>
              <p className="mt-4 text-text-muted">No spreadsheets, sticky notes, or switching between screens to answer a guest.</p>
            </div>
            <div className="mt-10 grid gap-5 md:grid-cols-3">
              {shiftFlow.map(({ step, title, description }) => (
                <div key={step} className="relative rounded-2xl border border-border bg-background p-6">
                  <span className="text-sm font-black tracking-widest text-primary-600">{step}</span>
                  <h3 className="mt-3 text-lg font-bold">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
          <div className="flex flex-col items-start justify-between gap-6 rounded-3xl border border-primary-100 bg-primary-50 p-7 sm:p-10 md:flex-row md:items-center">
            <div>
              <h2 className="text-2xl font-black sm:text-3xl">Ready to bring your hotel onboard?</h2>
              <p className="mt-2 max-w-2xl text-text-muted">Create your property and manager account, then sign in to set up rooms and start managing your hotel.</p>
            </div>
            <Link to="/register-your-hotel" className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary-600 px-6 py-3 font-bold text-white shadow-md transition hover:bg-primary-700">
              Get started <ArrowRight size={18} />
            </Link>
          </div>
          <p className="mt-6 text-center text-sm text-text-muted">
            Looking for a hotel stay? <Link to="/discover" className="font-semibold text-primary-700 hover:underline">Browse hotels</Link>
          </p>
        </section>
      </main>
    </div>
  );
}

const TILE_TONES = {
  primary: 'border-primary-100 bg-primary-50/70 text-primary-700',
  warning: 'border-warning-100 bg-warning-50/70 text-warning-700',
  success: 'border-success-100 bg-success-50/70 text-success-700',
  danger: 'border-danger-100 bg-danger-50/70 text-danger-700',
};

function PreviewTile({ icon: Icon, label, value, hint, tone }) {
  return (
    <div className={`rounded-lg border p-2.5 ${TILE_TONES[tone]}`}>
      <p className="flex items-center gap-1.5 text-[10px] font-semibold leading-tight">
        <Icon size={12} className="shrink-0" />
        <span className="min-w-0">{label}</span>
      </p>
      <p className="mt-1 text-lg font-bold leading-none text-text">{value}</p>
      <p className="mt-1 text-[10px] leading-tight text-text-muted">{hint}</p>
    </div>
  );
}

function PreviewStat({ label, value }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-text-muted">{label}</p>
      <p className="truncate font-bold text-text">{value}</p>
    </div>
  );
}
