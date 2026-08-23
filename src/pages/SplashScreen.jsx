import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles.css';
import logo from '../logo.svg';

const SplashScreen = () => {
  const navigate = useNavigate();
  const [phase, setPhase] = useState('logo');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('brand'), 900);
    const t2 = setTimeout(() => navigate('/permissions'), 2600);

    const handleKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        navigate('/permissions');
      }
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      window.removeEventListener('keydown', handleKey);
    };
  }, [navigate]);

  return (
    <div className="splash-root">
      {/* Gradient backdrop */}
      <div className="splash-backdrop" />

      {/* Floating particles */}
      <div className="splash-particles">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="splash-particle"
            style={{
              left: `${5 + (i * 13) % 90}%`,
              animationDuration: `${6 + (i % 5) * 1.8}s`,
              animationDelay: `${(i % 4) * 0.9}s`,
              width: `${4 + (i % 3) * 3}px`,
              height: `${4 + (i % 3) * 3}px`,
              opacity: 0.12 + (i % 4) * 0.04,
            }}
          />
        ))}
      </div>

      {/* Main content */}
      <div className="splash-content">
        {/* Logo */}
        <div className={`splash-logo-wrap ${phase !== 'logo' ? 'active' : ''}`}>
          <div className="splash-logo-container">
            <img src={logo} alt="SwachhLens" className="splash-logo-img" />
          </div>
        </div>

        {/* Brand name */}
        <div className={`splash-brand ${phase === 'brand' ? 'visible' : ''}`}>
          <h1 className="splash-brand-text">
            <span className="splash-brand-green">Swachh</span>
            <span className="splash-brand-blue">Lens</span>
          </h1>
        </div>

        {/* Loading indicator */}
        <div className="splash-loader visible">
          <div className="splash-loader-bar" />
        </div>
      </div>
    </div>
  );
};

export default SplashScreen;
