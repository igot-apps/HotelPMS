import { Link } from 'react-router-dom';
import { ArrowRight, BedDouble, Building2, CalendarCheck2, ChartNoAxesCombined, ShieldCheck, Users } from 'lucide-react';
import PublicNavbar from '../components/public/PublicNavbar';

const features = [
  { icon: CalendarCheck2, title: 'Reservations in one place', description: 'Track bookings, arrivals, departures, payments, and guest details from a single workspace.' },
  { icon: BedDouble, title: 'Rooms and daily operations', description: 'See room availability, occupancy, housekeeping needs, and in-house guests at a glance.' },
  { icon: ChartNoAxesCombined, title: 'A public booking page', description: 'Give guests a simple way to discover your property and book directly online.' },
  { icon: Users, title: 'A team for your property', description: 'Give managers and reception staff access to the tools they need for their work.' },
];

export default function ForHotelsPage() {
  return (
    <div className="min-h-screen bg-background text-text">
      <PublicNavbar />

      <main>
        <section className="relative overflow-hidden bg-gradient-to-br from-primary-700 via-primary-800 to-secondary-900">
          <div className="pointer-events-none absolute -left-24 -top-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-40 -right-20 h-[30rem] w-[30rem] rounded-full bg-emerald-300/10 blur-3xl" />
          <div className="relative mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 md:grid-cols-[1.1fr_0.9fr] md:items-center md:py-28">
            <div>
              <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white">
                <Building2 size={17} /> STAYFOLIO FOR HOTELS
              </div>
              <h1 className="max-w-3xl text-4xl font-black leading-tight tracking-tight text-white sm:text-5xl lg:text-6xl">
                Run your hotel with more clarity.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-white/80">
                Stayfolio gives independent hotels one place to manage reservations, rooms, guests, and everyday front desk work.
              </p>
              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link to="/register-your-hotel" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-6 py-3 font-bold text-primary-800 shadow-lg transition hover:bg-primary-50">
                  Register your hotel <ArrowRight size={18} />
                </Link>
                <Link to="/hotel/login" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 font-semibold text-white transition hover:bg-white/15">
                  Hotel staff sign in
                </Link>
              </div>
              <p className="mt-4 text-sm text-white/65">Already using Stayfolio? Sign in to your hotel workspace.</p>
            </div>

            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 shadow-2xl backdrop-blur-sm sm:p-7">
              <div className="rounded-2xl bg-white p-6 shadow-xl sm:p-8">
                <div className="flex items-center justify-between border-b border-border pb-5">
                  <div>
                    <p className="text-sm font-semibold text-text-muted">TODAY AT YOUR HOTEL</p>
                    <h2 className="mt-1 text-xl font-bold">A clearer front desk</h2>
                  </div>
                  <div className="rounded-xl bg-primary-50 p-3 text-primary-700"><Building2 size={23} /></div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <Metric label="Arrivals" value="12" />
                  <Metric label="In-house" value="28" />
                  <Metric label="Available rooms" value="7" />
                  <Metric label="Needs attention" value="2" />
                </div>
                <div className="mt-5 rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold">Reservation overview</p>
                      <p className="mt-1 text-sm text-text-muted">Guest details and room status together</p>
                    </div>
                    <CalendarCheck2 className="shrink-0 text-primary-600" size={22} />
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm font-medium text-success-700">
                  <ShieldCheck size={17} /> Your property data stays in your hotel workspace
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-16 sm:px-8 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-primary-700">Made for hotel teams</p>
            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">The essentials to keep each shift moving</h2>
            <p className="mt-4 text-text-muted">Manage the guest journey from booking through checkout without losing track of the details.</p>
          </div>
          <div className="mt-11 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
                <div className="inline-flex rounded-xl bg-primary-50 p-3 text-primary-700"><Icon size={22} /></div>
                <h3 className="mt-5 text-lg font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 md:pb-20">
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

function Metric({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-background p-4">
      <p className="text-sm text-text-muted">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}
