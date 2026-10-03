// Server Component — maps the whole catalog, never indexes specific
// entries, so a 4th/5th product needs only a new data/explore-products.js
// entry, no change here. See Milestone 3.0 Developer Plan, Module 3.
import exploreProducts from '../../data/explore-products';
import ExploreProductCard from './ExploreProductCard';

export default function ExploreProductGrid() {
  return (
    <div className="g3 explore-grid">
      <style>{`
        .g3.explore-grid { align-items: stretch; }
      `}</style>
      {exploreProducts.map((product) => (
        <ExploreProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
