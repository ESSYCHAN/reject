interface HeaderProps {
  activeTab: 'decoder' | 'tracker';
  onTabChange: (tab: 'decoder' | 'tracker') => void;
}

export function Header({ activeTab, onTabChange }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-content">
        <h1 className="logo">REJECT</h1>
        <nav className="nav">
          <button
            className={`nav-btn ${activeTab === 'decoder' ? 'active' : ''}`}
            onClick={() => onTabChange('decoder')}
          >
            Decoder
          </button>
          <button
            className={`nav-btn ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => onTabChange('tracker')}
          >
            Tracker
          </button>
        </nav>
      </div>
    </header>
  );
}
