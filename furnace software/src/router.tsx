import Home from './page/Home/Home';
import Product from './page/Product/Product';
import FinancialReport from './page/FinancialReport/FinancialReport';
import Plan from './page/Plan/Plan';
import Task from './page/Plan/Task/Task';
import PlanHeader from './page/Plan/PlanHeader/PlanHeader';

export const routes = [
  { path: '/', label: 'Home', component: Home },
  { path: '/plan', label: 'Plan', component: Task },
  { path: '/product', label: 'Products', component: Product },
  { path: '/financial-report', label: 'Financial Report', component: FinancialReport },
];

// Resolves the current URL, including Plan subpages and the fallback for unknown paths.
export default function Router() {
  const pathname = window.location.pathname.replace(/\/+$/, '') || '/';
  if (pathname === '/plan/calendar') {
    return (
      <section className="page-frame">
        <PlanHeader active="calendar" />
        <div className="page-panel panel-frame">
          <Plan />
        </div>
      </section>
    );
  }
  // Keep old checklist bookmarks working after the rename to Task.
  if (pathname === '/plan/task' || pathname === '/plan/check-list') return <Task />;
  if (pathname === '/plan/task-history') return <Task history />;
  const route = routes.find(({ path }) => path === pathname);

  if (!route) {
    return (
      <section>
        <h1>Page not found</h1>
        <a href="/">Return home</a>
      </section>
    );
  }

  const Page = route.component;
  return <Page />;
}
