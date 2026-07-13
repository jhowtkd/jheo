import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { recordPageView } from '../telemetry/sessionTelemetry.js';
import { routeIdFromPath } from '../i18n/localePath.js';

/**
 * Fires `page_view` telemetry on every location change. Skips paths whose
 * first segment does not map to a known route id (e.g. /publishes/* deep
 * links) so the buffer only holds meaningful navigations.
 */
export function RouteListener() {
  const location = useLocation();
  useEffect(() => {
    const id = routeIdFromPath(location.pathname);
    if (id) recordPageView(id);
  }, [location.pathname]);
  return null;
}