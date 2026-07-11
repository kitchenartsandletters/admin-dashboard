const LOGO_URL =
  'https://rcrfakzdutwiuxsmsbkr.supabase.co/storage/v1/object/public/Images/KALInitialsOnly.png';

export default function MissingProfile() {
  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 h-16 w-16 rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 dark:ring-gray-700 flex items-center justify-center p-2.5">
          <img
            src={LOGO_URL}
            alt="Kitchen Arts & Letters"
            className="max-h-full max-w-full object-contain"
          />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
          Access not set up yet
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
          You&apos;re signed in, but this account hasn&apos;t been given an access profile.
          Ask an administrator to finish onboarding — it only takes a moment.
        </p>
      </div>
    </div>
  );
}
