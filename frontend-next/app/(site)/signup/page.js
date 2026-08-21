// Same content as /register (the old app routed both /register and /signup
// to the same Signup component) — see components/auth/RegisterForm.js.
import RegisterForm from '../../../components/auth/RegisterForm';

export const metadata = { title: 'Create Account | SilverSurfers' };

export default function SignupPage() {
  return <RegisterForm />;
}
