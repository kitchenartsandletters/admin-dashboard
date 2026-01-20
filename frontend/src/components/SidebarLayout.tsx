import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, ChevronDown, ChevronRight } from 'lucide-react'; 
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
  { label: 'System Status', path: '/status', roles: ['admin'] },
  { label: 'Reports', path: '/reports', roles: ['admin'] },
  { label: 'Account', path: '/account', roles: ['admin', 'editor', 'user'] },
];

const SidebarLayout = ({ children }: { children: React.ReactNode }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Track which parent menus are expanded by their path
  const [expandedMenus, setExpandedMenus] = useState<Record<string, boolean>>({});
  
  const location = useLocation();
  const { role } = useAuth();

  const closeSidebar = () => setSidebarOpen(false);
  const toggleSidebar = () => setSidebarOpen(prev => !prev);

  // Sync expanded state with URL on navigation
  useEffect(() => {
    const newExpandedState = { ...expandedMenus };
    let changed = false;

    navItems.forEach(item => {
      if (item.children) {
        const isChildActive = item.children.some(child => location.pathname === child.path);
        const isParentActive = location.pathname === item.path;

        // If we are on a child or parent route, ensure the menu is expanded
        if ((isChildActive || isParentActive) && !expandedMenus[item.path]) {
          newExpandedState[item.path] = true;
          changed = true;
        }
      }
    });

    if (changed) setExpandedMenus(newExpandedState);
  }, [location.pathname]);

  const toggleMenu = (path: string) => {
    setExpandedMenus(prev => ({
      ...prev,
      [path]: !prev[path]
    }));
  };

  const visibleNavItems = navItems
    .filter(item => role && item.roles.includes(role))
    .map(item => ({
      ...item,
      children: item.children?.filter(child => role && child.roles.includes(role)),
    }));

  return (
    <div className="flex min-h-screen bg-white dark:bg-gray-900 text-black dark:text-white">
      {/* Sidebar */}
      <aside className={`
        fixed z-40 top-0 left-0 h-full w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        md:relative md:translate-x-0 md:flex md:flex-col md:shadow-none
      `}>
        <div className="flex justify-center items-center py-6 border-b dark:border-gray-700">
          <Link to="/welcome" onClick={closeSidebar}>
            <img
              src="https://rcrfakzdutwiuxsmsbkr.supabase.co/storage/v1/object/public/Images/KALInitialsOnly.png"
              alt="Logo"
              className="h-12 w-auto"
            />
          </Link>
        </div>

        <nav className="flex flex-col p-4 gap-1">
          {visibleNavItems.map((item) => {
            const hasChildren = !!item.children?.length;
            const isExpanded = !!expandedMenus[item.path];
            const isActive = location.pathname === item.path || 
                             item.children?.some(c => location.pathname === c.path);

            return (
              <div key={item.path} className="flex flex-col">
                {/* Parent Item */}
                <div className="flex items-center">
                    <Link
                        to={item.path}
                        onClick={() => {
                            if (hasChildren) {
                                // If it has children, clicking ensures it stays open while navigating
                                setExpandedMenus(prev => ({ ...prev, [item.path]: true }));
                            } else {
                                closeSidebar();
                            }
                        }}
                        className={`flex-1 px-3 py-2 rounded transition-all hover:bg-gray-100 dark:hover:bg-gray-700
                            ${isActive ? 'bg-gray-200 dark:bg-gray-700 font-semibold' : ''}`}
                    >
                        {item.label}
                    </Link>
                    {hasChildren && (
                        <button 
                            onClick={() => toggleMenu(item.path)}
                            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
                        >
                            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </button>
                    )}
                </div>

                {/* Generalized Submenu */}
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

      {/* Overlay & Content */}
      {sidebarOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={closeSidebar} />}
      
      <div className="flex-1 flex flex-col">
        <header className="flex items-center px-4 py-3 border-b md:hidden">
          <button onClick={toggleSidebar}><Menu /></button>
        </header>
        <main className="flex-1 p-6 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default SidebarLayout;