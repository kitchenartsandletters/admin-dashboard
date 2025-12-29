export default function MissingProfile() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="max-w-md p-6 border rounded">
        <h1 className="text-xl font-semibold mb-4">
          Account not fully provisioned
        </h1>

        <p className="mb-2">
          Your account exists, but no access profile has been assigned.
        </p>

        <p className="text-sm text-gray-600">
          Please contact an administrator to complete your onboarding.
        </p>
      </div>
    </div>
  );
}