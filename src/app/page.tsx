import { Car, FileWarning, ShieldAlert, Users, CheckCircle } from 'lucide-react';
import { SummaryCard } from '@/components/dashboard/summary-card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getSummaryStats, getVehicles, getAlerts } from '@/lib/data';
import type { Vehicle, Alert as AlertType, SummaryStats } from '@/lib/types';
import { VehicleCard } from '@/components/vehicle/vehicle-card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';

export default async function DashboardPage() {
  const stats: SummaryStats = await getSummaryStats();
  const recentVehicles: Vehicle[] = (await getVehicles()).slice(0, 4); // Display a few recent/problematic vehicles
  const alerts: AlertType[] = (await getAlerts()).filter(a => !a.isRead).slice(0,5);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <SummaryCard 
          title="Total Vehicles" 
          value={stats.totalVehicles} 
          icon={Car}
          iconClassName="text-primary"
        />
        <SummaryCard 
          title="Compliant Vehicles" 
          value={`${stats.compliantVehicles} / ${stats.totalVehicles}`}
          icon={CheckCircle}
          description={`${stats.totalVehicles > 0 ? ((stats.compliantVehicles/stats.totalVehicles)*100).toFixed(0) : 0}% compliance`}
          iconClassName="text-green-500"
        />
        <SummaryCard 
          title="Expiring Soon" 
          value={stats.expiringSoonDocuments} 
          icon={FileWarning}
          description="Documents needing attention"
          iconClassName="text-yellow-500"
        />
        <SummaryCard 
          title="Overdue Documents" 
          value={stats.overdueDocuments} 
          icon={ShieldAlert}
          description="Requires immediate action"
          iconClassName="text-red-500"
        />
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold font-headline">Vehicle Status Overview</h2>
            <Link href="/vehicles">
              <Button variant="outline">View All Vehicles</Button>
            </Link>
          </div>
          {recentVehicles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
              {recentVehicles.map((vehicle) => (
                <VehicleCard key={vehicle.id} vehicle={vehicle} />
              ))}
            </div>
          ) : (
            <Card className="flex flex-col items-center justify-center py-12">
              <Car className="w-16 h-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold mb-2">No Vehicles Yet</h3>
              <p className="text-muted-foreground mb-4">Add your first vehicle to get started.</p>
              <Link href="/vehicles/add">
                <Button>Add Vehicle</Button>
              </Link>
            </Card>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-semibold font-headline">Recent Alerts</h2>
            {alerts.length > 0 && <Link href="/alerts"><Button variant="outline" size="sm">View All</Button></Link>}
          </div>
          {alerts.length > 0 ? (
            <ScrollArea className="h-[400px] rounded-md border p-2 bg-card">
              <div className="space-y-3 p-2">
              {alerts.map((alert) => (
                <Alert key={alert.id} variant={alert.dueDate && new Date(alert.dueDate) < new Date() ? "destructive" : "default"} className="shadow-sm">
                  <ShieldAlert className="h-4 w-4" />
                  <AlertTitle className="font-semibold text-sm">{alert.documentType === 'Other' && alert.customDocumentTypeName ? alert.customDocumentTypeName : alert.documentType} - {alert.vehicleRegistration}</AlertTitle>
                  <AlertDescription className="text-xs">
                    {alert.message}
                    <div className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(alert.createdAt), { addSuffix: true })}
                    </div>
                  </AlertDescription>
                </Alert>
              ))}
              </div>
            </ScrollArea>
          ) : (
             <Alert className="shadow-sm">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <AlertTitle className="font-semibold">All Clear!</AlertTitle>
                <AlertDescription>
                  No active alerts at the moment.
                </AlertDescription>
              </Alert>
          )}
        </div>
      </div>
      
      {/* Placeholder for future charts or more detailed widgets */}
      {/* <div className="mt-6">
        <h2 className="text-2xl font-semibold font-headline mb-4">Compliance Trends</h2>
        <Card>
          <CardHeader>
            <CardTitle>Compliance Over Time (Placeholder)</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px] flex items-center justify-center text-muted-foreground">
            Chart data will be displayed here.
          </CardContent>
        </Card>
      </div> */}
    </div>
  );
}
