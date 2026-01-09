import {
  SignInButton,
  SignUpButton,
  SignedIn,
  SignedOut,
  UserButton,
  useUser,
} from '@clerk/clerk-react';
import './AuthButtons.css';

export function AuthButtons() {
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
  const { isSignedIn, user, isLoaded } = useUser();

  return {
    isSignedIn: !!isSignedIn,
    userId: user?.id,
    email: user?.primaryEmailAddress?.emailAddress,
    isLoaded,
  };
}
