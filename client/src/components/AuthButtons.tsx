import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
  useClerk,
} from '@clerk/clerk-react';
import './AuthButtons.css';

// Check if Clerk is available
function useClerkAvailable() {
  try {
    const clerk = useClerk();
    return !!clerk.loaded || clerk.loaded === undefined;
  } catch {
    return false;
  }
}

export function AuthButtons() {
  const clerkAvailable = useClerkAvailable();

  if (!clerkAvailable) {
    // Clerk not configured - show nothing or a placeholder
    return null;
  }

  return (
    <div className="auth-buttons">
      <SignedOut>
        <SignInButton mode="modal">
          <span className="auth-link">Sign In</span>
        </SignInButton>
        <span className="auth-divider">/</span>
        <SignUpButton mode="modal">
          <span className="auth-link auth-link-primary">Sign Up</span>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton afterSignOutUrl="/" />
      </SignedIn>
    </div>
  );
}

export function useAuth() {
  try {
    const { isSignedIn, user, isLoaded } = useUser();
    return {
      isSignedIn: !!isSignedIn,
      userId: user?.id,
      email: user?.primaryEmailAddress?.emailAddress,
      isLoaded,
    };
  } catch {
    // Clerk not available
    return {
      isSignedIn: false,
      userId: undefined,
      email: undefined,
      isLoaded: true,
    };
  }
}
