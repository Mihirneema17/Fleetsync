
import { Car, FileWarning, ShieldAlert, Users, CheckCircle, ShieldCheck, ActivitySquare, Leaf, Paperclip } from 'lucide-react';
import { SummaryCard } from '@/components/dashboard/summary-card';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { getSummaryStats, getVehicles, getAlerts, getDocumentComplianceStatus } from '@/lib/data';
import type { Vehicle, Alert as AlertType, SummaryStats, DocumentType, VehicleDocument } from '@/lib/types';
import { VehicleCard } from '@/components/vehicle/vehicle-card';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDistanceToNow, parseISO, differenceInDays, format } from 'date-fns';
import { EXPIRY_WARNING_DAYS, DATE_FORMAT } from '@/lib/constants';
import { cn } from '@/lib/utils';

interface DocumentAlertItem {
  vehicleId: string;
  vehicleRegistration: string;
  documentId: string;
  documentType: DocumentType;
  customTypeName?: string;
  expiryDate: string;
  statusText: string;
  statusVariant: 'destructive' | 'secondary' | 'default' | 'outline';
  daysDiff: number; // positive for expiring soon (days left), negative for overdue (days past)
}

const documentTypeIcons: Record<DocumentType | 'Generic', React.ElementType> = {
  Insurance: ShieldCheck,
  Fitness: ActivitySquare,
  PUC: Leaf,
  AITP: Paperclip,
  Other: FileWarning,
  Generic: FileWarning,
};

export default async function DashboardPage() {
  const stats: SummaryStats = await getSummaryStats();
  const allVehicles: Vehicle[] = await getVehicles();
  const recentVehicles: Vehicle[] = allVehicles.slice(0, 4);
  const alerts: AlertType[] = (await getAlerts()).filter(a => !a.isRead).slice(0,5);

  const processVehiclesForDocumentAlerts = (vehicles: Vehicle[], docType: DocumentType): DocumentAlertItem[] => {
    const items: DocumentAlertItem[] = [];
    const now = new Date();

    vehicles.forEach(vehicle => {
      vehicle.documents.forEach(doc => {
        if (doc.type === docType && doc.expiryDate) {
          const expiry = parseISO(doc.expiryDate);
          const daysDifference = differenceInDays(expiry, now);
          const complianceStatus = getDocumentComplianceStatus(doc.expiryDate);

          if (complianceStatus === 'Overdue' || complianceStatus === 'ExpiringSoon') {
            let statusText = '';
            let statusVariant: DocumentAlertItem['statusVariant'] = 'default';

            if (complianceStatus === 'Overdue') {
              statusText = `Overdue by ${Math.abs(daysDifference)} day(s)`;
              statusVariant = 'destructive';
            } else if (complianceStatus === 'ExpiringSoon') {
              statusText = `Expires in ${daysDifference} day(s)`;
              statusVariant = 'secondary';
            }
            
            items.push({
              vehicleId: vehicle.id,
              vehicleRegistration: vehicle.registrationNumber,
              documentId: doc.id,
              documentType: doc.type,
              customTypeName: doc.customTypeName,
              expiryDate: doc.expiryDate,
              statusText,
              statusVariant,
              daysDiff: daysDifference,
            });
          }
        }
      });
    });
    // Sort by daysDiff (overdue first, then soonest expiring)
    return items.sort((a, b) => a.daysDiff - b.daysDiff);
  };

  const insuranceAlertItems = processVehiclesForDocumentAlerts(allVehicles, 'Insurance');
  const fitnessAlertItems = processVehiclesForDocumentAlerts(allVehicles, 'Fitness');
  const pucAlertItems = processVehiclesForDocumentAlerts(allVehicles, 'PUC');
  const aitpAlertItems = processVehiclesForDocumentAlerts(allVehicles, 'AITP');

  const documentSections: { title: string; docType: DocumentType; items: DocumentAlertItem[]; icon: React.ElementType }[] = [
    { title: "Insurance", docType: 'Insurance', items: insuranceAlertItems, icon: documentTypeIcons.Insurance },
    { title: "Fitness Certificates", docType: 'Fitness', items: fitnessAlertItems, icon: documentTypeIcons.Fitness },
    { title: "PUC Certificates", docType: 'PUC', items: pucAlertItems, icon: documentTypeIcons.PUC },
    { title: "AITP Documents", docType: 'AITP', items: aitpAlertItems, icon: documentTypeIcons.AITP },
  ];

  return (
    <div className="flex flex-col gap-8">
      {/* General Stats */}
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
          title="Expiring Soon (All Docs)" 
          value={stats.expiringSoonDocuments} 
          icon={FileWarning}
          description="Total documents needing attention"
          iconClassName="text-yellow-500"
        />
        <SummaryCard 
          title="Overdue (All Docs)" 
          value={stats.overdueDocuments} 
          icon={ShieldAlert}
          description="Total documents requiring immediate action"
          iconClassName="text-red-500"
        />
      </div>

      {/* Detailed Document Compliance Status */}
      <div>
        <h2 className="text-2xl font-semibold font-headline mb-4">Detailed Document Status</h2>
        <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
          {documentSections.map(({ title, items, icon: Icon, docType }) => (
            <Card key={title} className="shadow-md">
              <CardHeader className="pb-3">
                <CardTitle className="font-headline text-lg flex items-center">
                  <Icon className="mr-2 h-5 w-5 text-primary" />
                  {title} - Action Required
                </CardTitle>
              </CardHeader>
              <CardContent>
                {items.length > 0 ? (
                  <ScrollArea className={cn("max-h-[300px]", items.length > 5 ? "h-[300px]" : "")}>
                    <Table className="w-full">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[35%]">Vehicle Reg.</TableHead>
                          <TableHead className="w-[45%]">Status</TableHead>
                          <TableHead className="text-right w-[20%]">Expires</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(item => (
                          <TableRow key={item.documentId}>
                            <TableCell className="font-medium">
                              <Link href={`/vehicles/${item.vehicleId}`} className="hover:underline text-primary">
                                {item.vehicleRegistration}
                              </Link>
                            </TableCell>
                            <TableCell>
                              <Badge 
                                variant={item.statusVariant}
                                className={cn(
                                  item.statusVariant === 'secondary' ? 'bg-yellow-100 text-yellow-800 border-yellow-300' : ''
                                )}
                              >
                                {item.statusText}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right text-xs">
                              {format(parseISO(item.expiryDate), DATE_FORMAT)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </ScrollArea>
                ) : (
                  <p className="text-sm text-muted-foreground py-4 text-center">No upcoming or overdue {docType.toLowerCase()} documents.</p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
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
                      {formatDistanceToNow(parseISO(alert.createdAt), { addSuffix: true })}
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
      
    </div>
  );
}

