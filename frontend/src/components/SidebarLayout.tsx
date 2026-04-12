import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, ChevronDown, ChevronRight } from 'lucide-react'; 
import { useAuth } from '../auth/AuthProvider';

const navItems = [
  {
    label: 'Request Service',
    path: '/requests',
    roles: ['admin', 'editor'],
    children: [
      { label: 'Blacklist', path: '/blacklist', roles: ['admin', 'editor'] },
    ],
  },
  {
    label: 'Damaged Books',
    path: '/damaged',
    roles: ['admin', 'editor', 'user'],
    children: [
        { label: 'Bulk Create', path: '/damaged/bulk-create', roles: ['admin'] },
    ]
  },
  { label: 'Preorders', path: '/preorders', roles: ['admin', 'editor'] },
  { label: 'Campaigns', path: '/campaigns', roles: ['admin', 'editor'] },
  { label: 'System Status', path: '/status', roles: ['admin'] },
  {
    label: 'Reports',
    path: '/reports',
    roles: ['admin', 'editor', 'user'],
    children: [
        { label: 'Business Calendar', path: '/reports/calendar', roles: ['admin'] },
        { label: 'Report Jobs', path: '/reports/jobs', roles: ['admin'] },
    ]
  },
  { label: 'Account', path: '/account', roles: ['admin', 'editor', 'user'] },
];

interface SidebarLayoutProps {
  children: React.ReactNode;
  dateTime?: { date: string; time: string };
}

const SidebarLayout = ({ children, dateTime }: SidebarLayoutProps) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  
  const location = useLocation();
  const { role } = useAuth();

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  useEffect(() => {
    const newExpandedState = { ...expandedMenus };
    let changed = false;

    navItems.forEach(item => {
      if (item.children) {
        const isChildActive = item.children.some(child => location.pathname === child.path);
        const isParentActive = location.pathname === item.path;
        if ((isChildActive || isParentActive) && !expandedMenus[item.path]) {
          newExpandedState[item.path] = true;
          changed = true;
        }
      }
    });

    if (changed) setExpandedMenus(newExpandedState);
  }, [location.pathname]);

  const toggleMenu = (path: string) => {
    setExpandedMenus(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const visibleNavItems = navItems
    .filter(item => role && item.roles.includes(role))
    .map(item => ({
      ...item,
      children: item.children?.filter(child => role && child.roles.includes(role)),
    }));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-white dark:bg-gray-900 text-black dark:text-white">
      
      {/* Sidebar */}
      <aside className={`
        fixed z-50 top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:flex-col md:shadow-none
      `}>
        <div className="flex justify-center items-center py-6 border-b dark:border-gray-700 shrink-0">
          <Link to="/welcome" onClick={closeSidebar}>
            <img
              src="https://rcrfakzdutwiuxsmsbkr.supabase.co/storage/v1/object/public/Images/KALInitialsOnly.png"
              alt="Logo"
              className="h-12 w-auto"
            />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-4 gap-1">
          {visibleNavItems.map((item) => {
            const hasChildren = !!item.children?.length;
            const isExpanded = !!expandedMenus[item.path];
            const isActive = location.pathname === item.path || 
                             item.children?.some(c => location.pathname === c.path);

            return (
              <div key={item.path} className="flex flex-col">
                <div className="flex items-center">
                    {/* UPDATED: Always close sidebar on click, regardless of children */}
                    <Link
                        to={item.path}
                        onClick={closeSidebar}
                        className={`flex-1 px-3 py-2 rounded transition-all hover:bg-gray-100 dark:hover:bg-gray-700
                            ${isActive ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : ''}`}
                    >
                        {item.label}
                    </Link>
                    {hasChildren && (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation(); // Prevent affecting the link click
                                toggleMenu(item.path);
                            }}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                    )}
                </div>

                {hasChildren && isExpanded && (
                  <div className="flex flex-col mt-1 ml-4 border-l-2 border-gray-100 dark:border-gray-700">
                    {item.children?.map(child => (
                      <Link
                        key={child.path}
                        to={child.path}
                        onClick={closeSidebar}
                        className={`pl-4 py-2 block text-sm hover:text-blue-500 transition-colors
                          ${location.pathname === child.path ? 'text-blue-600 font-bold' : 'text-gray-500'}`}
                      >
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      {/* Overlay */}
      {sidebarOpen && <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={closeSidebar} />}
      
      {/* Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-full relative">
        {/* Mobile Header - Updated to include Time */}
        <header className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-800 md:hidden shrink-0">
          <button onClick={toggleSidebar} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800">
            <Menu />
          </button>
          
          {/* Relocated Mobile Time */}
          {dateTime && (
            <span className="font-mono text-sm font-bold text-gray-900 dark:text-white tabular-nums">
              {dateTime.time}
            </span>
          )}
        </header>
        
        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 w-full">
          {children}
        </main>
      </div>
    </div>
  );
};

export default SidebarLayout;