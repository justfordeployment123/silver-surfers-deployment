// Client Component: the CTA needs an onClick handler for click tracking
// (trackExploreClick), which forces this leaf into the client bundle. The
// rest of the card is static markup — not worth a separate
// server/client split for one handler on one small component.
'use client';

import { trackExploreClick } from '../../lib/trackExploreClick';

function CheckBadge() {
  return (
    <svg className="explore-check" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="10" fill="var(--t6)" />
      <path d="M6 10.2l2.4 2.4L14 7" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function ExploreProductCard({ product }) {
  return (
    <div className="card explore-card">
      <style>{`
        .explore-card {
          display: flex;
          flex-direction: column;
          height: 100%;
          padding: 0 0 28px;
          overflow: hidden;
        }
        .explore-card-media {
          aspect-ratio: 4 / 3;
          width: 100%;
          overflow: hidden;
          background: var(--sand);
        }
        .explore-card-media img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }
        .explore-card-body {
          padding: 24px 24px 0;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .explore-card-tagline {
          font-size: 16px;
          color: var(--ink6);
          font-weight: 500;
          line-height: 1.5;
          margin-bottom: 8px;
        }
        .explore-card-desc {
          font-size: 16px;
          color: var(--ink6);
          line-height: 1.65;
          margin-bottom: 16px;
        }
        .explore-card-benefits {
          margin-bottom: 20px;
        }
        .explore-benefit {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          font-size: 16px;
          color: var(--ink6);
          line-height: 1.5;
          margin-bottom: 8px;
        }
        .explore-check {
          width: 18px;
          height: 18px;
          flex-shrink: 0;
          margin-top: 1px;
        }
        .explore-card-cta {
          margin-top: auto;
          align-self: flex-start;
        }
      `}</style>

      <div className="card-bar" />

      <div className="explore-card-media">
        <img src={product.image} alt={product.imageAlt} loading="lazy" />
      </div>

      <div className="explore-card-body">
        <span className="tag">{product.category.toUpperCase()}</span>
        <h3 className="h3">{product.name}</h3>
        {product.tagline && <p className="explore-card-tagline">{product.tagline}</p>}
        <p className="explore-card-desc">{product.description}</p>

        <div className="explore-card-benefits">
          {product.benefits.map((benefit) => (
            <div className="explore-benefit" key={benefit}>
              <CheckBadge />
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <a
          href={product.cta.href}
          className="btn btn-p explore-card-cta"
          {...(product.cta.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
          onClick={() => trackExploreClick(product.cta.analyticsId)}
        >
          {product.cta.label} →
        </a>
      </div>
    </div>
  );
}
