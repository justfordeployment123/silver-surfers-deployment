// Server Component shell, same server-shell-plus-components split used by
// /resources and /services. Milestone 3.0 only — Explore is a discovery
// layer, every CTA routes to an existing external system (see
// data/explore-products.js); no purchase/dashboard logic lives here.
import ExploreHero from '../../../components/explore/ExploreHero';
import ExploreProductGrid from '../../../components/explore/ExploreProductGrid';

export const metadata = {
  title: 'Explore | SilverSurfers.ai',
  description:
    'Explore practical training, assessments, and resources designed to help leaders navigate AI, business, and what comes next.',
};

export default function ExplorePage() {
  return (
    <>
      <ExploreHero />
      <section className="sec">
        <div className="wrap">
          <ExploreProductGrid />
        </div>
      </section>
    </>
  );
}
