const LOGO_URL =
  'https://rcrfakzdutwiuxsmsbkr.supabase.co/storage/v1/object/public/Images/KALInitialsOnly.png';

export default function AuthLoading() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 flex items-center justify-center p-2.5">
          <img
            src={LOGO_URL}
            alt="Kitchen Arts & Letters"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <div className="w-6 h-6 border-[3px] border-blue-600 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-500 dark:text-gray-400">Signing you in…</p>
      </div>
    </div>
  );
}
