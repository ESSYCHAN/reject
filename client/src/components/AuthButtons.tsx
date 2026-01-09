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
          <button className="btn btn-secondary btn-small">Sign In</button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button className="btn btn-primary btn-small">Sign Up</button>
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
