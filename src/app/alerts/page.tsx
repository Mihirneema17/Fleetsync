
import { getAlerts, markAlertAsRead } from '@/lib/data';
import type { Alert as AlertType } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { BellRing, Check, ShieldAlert, X } from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { cn } from '@/lib/utils';
import Link from 'next/link';
import { revalidatePath } from 'next/cache';

// Server Action to mark an alert as read
async function markReadAction(alertId: string) {
  'use server';
  await markAlertAsRead(alertId);
  revalidatePath('/alerts'); // Revalidate the alerts page to reflect changes
}

export default async function AlertsPage() {
  const alerts = await getAlerts();
  const unreadAlerts = alerts.filter(a => !a.isRead);
  const readAlerts = alerts.filter(a => a.isRead);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold font-headline">Notifications & Alerts</h1>
        {/* Can add filters or actions here */}
      </div>

      {alerts.length === 0 ? (
        <Card className="text-center py-12">
          <BellRing className="mx-auto h-16 w-16 text-muted-foreground mb-4" />
          <CardTitle className="text-2xl font-semibold font-headline mb-2">All Clear!</CardTitle>
          <CardDescription className="text-muted-foreground">You have no new alerts or notifications.</CardDescription>
        </Card>
      ) : (
        <div className="space-y-8">
          {unreadAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Unread Alerts ({unreadAlerts.length})</CardTitle>
                <CardDescription>Actionable alerts that require your attention.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {unreadAlerts.map((alert) => (
                  <Alert
                    key={alert.id}
                    variant={alert.dueDate && parseISO(alert.dueDate) < new Date() ? 'destructive' : 'default'}
                    className="shadow-sm border-l-4 data-[variant=destructive]:border-destructive data-[variant=default]:border-yellow-500"
                    data-variant={alert.dueDate && parseISO(alert.dueDate) < new Date() ? 'destructive' : 'default'}
                  >
                    <ShieldAlert className="h-5 w-5" />
                    <div className="flex-1">
                      <AlertTitle className="font-semibold">
                        {alert.documentType === 'Other' && alert.customDocumentTypeName ? alert.customDocumentTypeName : alert.documentType} Expiring for <Link href={`/vehicles/${alert.vehicleId}`} className="underline hover:text-primary">{alert.vehicleRegistration}</Link>
                      </AlertTitle>
                      <AlertDescription>
                        {alert.message}
                        <span className="block text-xs text-muted-foreground mt-1">
                          Due: {format(parseISO(alert.dueDate), 'PPP')} ({formatDistanceToNow(parseISO(alert.dueDate), { addSuffix: true })})
                        </span>
                      </AlertDescription>
                    </div>
                    <form action={markReadAction.bind(null, alert.id)} className="ml-auto">
                       <Button type="submit" variant="ghost" size="sm">
                          <Check className="mr-1 h-4 w-4" /> Mark as Read
                       </Button>
                    </form>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}

          {readAlerts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="font-headline">Read Alerts ({readAlerts.length})</CardTitle>
                <CardDescription>Previously viewed alerts.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {readAlerts.map((alert) => (
                  <Alert key={alert.id} className="opacity-70 bg-muted/50 shadow-sm">
                    <ShieldAlert className="h-5 w-5" />
                     <div className="flex-1">
                        <AlertTitle className="font-semibold">
                           {alert.documentType === 'Other' && alert.customDocumentTypeName ? alert.customDocumentTypeName : alert.documentType} for <Link href={`/vehicles/${alert.vehicleId}`} className="underline hover:text-primary">{alert.vehicleRegistration}</Link>
                        </AlertTitle>
                        <AlertDescription>
                           {alert.message}
                           <span className="block text-xs text-muted-foreground mt-1">
                           Originally Due: {format(parseISO(alert.dueDate), 'PPP')}
                           </span>
                        </AlertDescription>
                     </div>
                  </Alert>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
