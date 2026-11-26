import HomeClock from './HomeClock/HomeClock';
import HomePlanWidget from './HomePageWidget/HomePlanWidget/HomePlanWidget';
import HomeProductWidget from './HomePageWidget/HomeProductWidget/HomeProductWidget';
import HomeFinancialWidget from './HomePageWidget/HomeFinancialWidget/HomeFinancialWidget';
import './Home.css';

// Shows financial totals and saved products alongside the switchable Plan widget.
export default function Home() {
  return (
    <section className="home-page page-frame">
      <header className="home-heading page-header">
        <h1>Furnace Studio</h1>
        <HomeClock />
      </header>
      <div className="home-dashboard">
        <HomePlanWidget />
        <HomeFinancialWidget />
        <HomeProductWidget />
      </div>
    </section>
  );
}
