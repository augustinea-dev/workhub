import LoginForm from "./login-form";

export const metadata = { title: "Sign in · Workhub" };

const ERRORS: Record<string, string> = {
  inactive: "Your account isn't active. Ask an admin to turn it on.",
  link: "That sign-in link expired or was already used. Request a new one.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-stone-50 px-4">
      <div className="w-full max-w-sm rounded-xl border border-stone-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-stone-900">Workhub</h1>
        <p className="mt-1 text-sm text-stone-500">Sign in with your work email. We&apos;ll send you a link.</p>
        {error && ERRORS[error] && (
          <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{ERRORS[error]}</p>
        )}
        <LoginForm />
      </div>
    </main>
  );
}
