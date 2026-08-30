import {
  Aperture, BadgeCheck, Banknote, Camera, CircleDollarSign, Frame,
  Images, LayoutDashboard, PackageCheck, Printer, Search, Truck, Users
} from 'lucide-react';

const nav = [
  ['Dashboard', LayoutDashboard], ['Events', Aperture], ['Participants', Users],
  ['Photo Intake', Images], ['Shooting Mode', Camera], ['Orders', PackageCheck],
  ['Print Queue', Printer], ['Production / QC', BadgeCheck], ['Framing', Frame],
  ['Delivery', Truck],
] as const;

const stats = [
  ['Participants', '126', '18 not photographed', Users],
  ['Orders', '94', '76 galleries ready', PackageCheck],
  ['Total Sales', '₱48,650', 'Across current event', CircleDollarSign],
  ['Collected', '₱39,200', '₱9,450 outstanding', Banknote],
] as const;

const pipeline = [
  ['Registered', 126, 100], ['Photographed', 108, 86], ['Gallery Ready', 76, 60],
  ['Ordered', 94, 75], ['Paid', 71, 56], ['Printed', 58, 46],
  ['QC Passed', 45, 36], ['Framed', 34, 27], ['Ready', 22, 17], ['Delivered', 14, 11],
] as const;

export default function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandmark"><Aperture size={22} /></div>
          <div><strong>PhotoFlow</strong><span>by Misantio</span></div>
        </div>
        <nav>
          {nav.map(([label, Icon], i) => (
            <button key={label} className={i === 0 ? 'nav-item active' : 'nav-item'}>
              <Icon size={17} /> <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="tagline">From Capture to Delivery.</div>
      </aside>

      <main>
        <header className="topbar">
          <div className="search"><Search size={17}/><span>Search participants, orders, IDs…</span><kbd>⌘K</kbd></div>
          <button className="primary"><Camera size={17}/> Shooting Mode</button>
        </header>

        <section className="content">
          <div className="hero">
            <div>
              <span className="eyebrow">School for Congregation Elders 2026</span>
              <h1>Studio Operations</h1>
              <p>Everything happening across registration, shooting, ordering, production, and delivery.</p>
            </div>
            <div className="event-chip">Active Event</div>
          </div>

          <div className="stats-grid">
            {stats.map(([label, value, hint, Icon], i) => (
              <article className={i === 3 ? 'stat accent' : 'stat'} key={label}>
                <div className="stat-head"><span>{label}</span><Icon size={17}/></div>
                <strong>{value}</strong><small>{hint}</small>
              </article>
            ))}
          </div>

          <div className="quick-row">
            <button>Add Participant</button><button>Upload Photos</button><button>Open Gallery</button>
            <button>Print Queue</button><button>Delivery Mode</button>
          </div>

          <div className="section-title">Production Pipeline</div>
          <div className="pipeline-grid">
            {pipeline.map(([label, count, pct]) => (
              <article className="pipe" key={label}>
                <div><span>{label}</span><small>{pct}%</small></div>
                <strong>{count}</strong>
                <div className="bar"><i style={{width:`${pct}%`}} /></div>
              </article>
            ))}
          </div>

          <div className="lower-grid">
            <section className="panel wide">
              <div className="panel-title"><div><h2>Recent Orders</h2><p>Latest submissions</p></div></div>
              {[
                ['SCE-042','Daniel Reyes','5R Framed','Paid','For Print','₱650'],
                ['SCE-038','Marco Villanueva','8R Premium','Partial','Printed','₱950'],
                ['SCE-031','Joel Santos','5R Classic','Paid','QC Check','₱550'],
                ['SCE-027','Ramon Cruz','8R Framed','Unpaid','Confirmed','₱850'],
              ].map(row => <div className="order-row" key={row[0]}><b>{row[1]}</b><span>{row[0]}</span><span>{row[2]}</span><em>{row[3]}</em><span>{row[4]}</span><strong>{row[5]}</strong></div>)}
            </section>
            <section className="panel">
              <div className="panel-title"><div><h2>Production Alerts</h2><p>Needs attention</p></div></div>
              {[
                ['Unpaid orders',12],['Balance remaining',9],['Proofs to verify',4],
                ['Waiting for print',18],['Waiting for framing',11],['Ready for pickup',22]
              ].map(([label,count]) => <div className="alert-row" key={String(label)}><span>{label}</span><b>{count}</b></div>)}
            </section>
          </div>
        </section>
      </main>
    </div>
  );
}
