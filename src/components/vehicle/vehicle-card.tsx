
import Link from 'next/link';
import type { Vehicle } from '@/lib/types';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Car, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { getDocumentComplianceStatus } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { differenceInDays, parseISO, formatISO } from 'date-fns';
import { EXPIRY_WARNING_DAYS } from '@/lib/constants';


const getOverallVehicleStatus = (vehicle: Vehicle): { status: 'Compliant' | 'ExpiringSoon' | 'Overdue' | 'MissingInfo', message: string } => {
  let hasOverdue = false;
  let hasExpiringSoon = false;
  let hasMissing = false;
  let expiringSoonCount = 0;
  let overdueCount = 0;

  if (!vehicle.documents || vehicle.documents.length === 0) {
    return { status: 'MissingInfo', message: 'No documents found.' };
  }

  vehicle.documents.forEach(doc => {
    const status = getDocumentComplianceStatus(doc.expiryDate);
    if (status === 'Overdue') {
      hasOverdue = true;
      overdueCount++;
    } else if (status === 'ExpiringSoon') {
      hasExpiringSoon = true;
      expiringSoonCount++;
    } else if (status === 'Missing') {
      hasMissing = true;
    }
  });

  if (hasOverdue) return { status: 'Overdue', message: `${overdueCount} document(s) overdue.` };
  if (hasExpiringSoon) return { status: 'ExpiringSoon', message: `${expiringSoonCount} document(s) expiring soon.` };
  if (hasMissing) return { status: 'MissingInfo', message: 'Some documents are missing.' };
  return { status: 'Compliant', message: 'All documents compliant.' };
};


export function VehicleCard({ vehicle }: { vehicle: Vehicle }) {
  const { status, message } = getOverallVehicleStatus(vehicle);

  const statusConfig = {
    Compliant: { icon: CheckCircle2, color: 'text-green-600', badgeVariant: 'default' as const, bgColor: 'bg-green-50' },
    ExpiringSoon: { icon: Clock, color: 'text-yellow-600', badgeVariant: 'secondary' as const, bgColor: 'bg-yellow-50' },
    Overdue: { icon: AlertTriangle, color: 'text-red-600', badgeVariant: 'destructive' as const, bgColor: 'bg-red-50' },
    MissingInfo: { icon: AlertTriangle, color: 'text-orange-500', badgeVariant: 'outline' as const, bgColor: 'bg-orange-50' },
  };

  const CurrentStatusIcon = statusConfig[status].icon;

  return (
    <Card className={cn(
        "shadow-md hover:shadow-xl transition-all duration-300 hover:-translate-y-1.5", // Enhanced hover effect
        statusConfig[status].bgColor
      )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-headline flex items-center">
            <Car className="mr-2 h-5 w-5 text-primary" />
            {vehicle.registrationNumber}
          </CardTitle>
          <Badge variant={statusConfig[status].badgeVariant} className={cn(statusConfig[status].color, 'border-' + statusConfig[status].color.replace('text-',''))}>
            {status}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">{vehicle.make} {vehicle.model} - {vehicle.type}</p>
      </CardHeader>
      <CardContent className="pb-2">
        <div className="flex items-center text-sm">
          <CurrentStatusIcon className={cn("mr-2 h-4 w-4", statusConfig[status].color)} />
          <span className={cn(statusConfig[status].color, "font-medium")}>{message}</span>
        </div>
        <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
          {vehicle.documents.slice(0, 2).map(doc => (
            <li key={doc.id} className="flex justify-between">
              <span>{doc.type === 'Other' && doc.customTypeName ? doc.customTypeName : doc.type}:</span>
              <span className={cn(
                getDocumentComplianceStatus(doc.expiryDate) === 'Overdue' ? 'text-red-500 font-semibold' : '',
                getDocumentComplianceStatus(doc.expiryDate) === 'ExpiringSoon' ? 'text-yellow-600 font-semibold' : ''
              )}>
                {doc.expiryDate ? formatISO(parseISO(doc.expiryDate), { representation: 'date' }) : 'N/A'}
              </span>
            </li>
          ))}
          {vehicle.documents.length > 2 && <li>And {vehicle.documents.length - 2} more...</li>}
        </ul>
      </CardContent>
      <CardFooter>
        <Link href={`/vehicles/${vehicle.id}`} passHref className="w-full">
          <Button variant="outline" size="sm" className="w-full">View Details</Button>
        </Link>
      </CardFooter>
    </Card>
  );
}
