import { useState } from 'react';
import { Link } from 'react-router-dom';
import { auth, ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.resetPassword(email);
      toast.success('If recovery is enabled for this deployment, a reset email will be sent.');
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 501) {
        setUnavailable(true);
        toast.error('Password reset is not enabled for this deployment.');
      } else {
        const message = err instanceof Error ? err.message : 'Failed to process password reset request';
        toast.error(message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md glass">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-12 h-12 rounded-xl bg-warning flex items-center justify-center mb-2">
            <KeyRound className="w-6 h-6 text-warning-foreground" />
          </div>
          <CardTitle className="font-display text-2xl">Reset Password</CardTitle>
          <CardDescription>
            Request password recovery only when this deployment has a configured email reset service.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {unavailable && (
            <Alert>
              <AlertTitle>Password reset unavailable</AlertTitle>
              <AlertDescription>
                This deployment does not have a production-ready password reset flow configured.
                Contact an administrator for account recovery.
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Request Password Reset
            </Button>
          </form>

          <Button asChild variant="outline" className="w-full">
            <Link to="/auth/login">Return to Sign In</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
