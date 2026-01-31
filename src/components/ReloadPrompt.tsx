import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { useEffect, useState } from "react";

function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // eslint-disable-next-line prefer-template
      console.log('SW Registered: ' + r)
    },
    onRegisterError(error) {
      console.log('SW registration error', error)
    },
  })

  // Check if we previously stored that offline was ready but user hasn't dismissed it yet
  const [showOfflineReady, setShowOfflineReady] = useState(false);

  useEffect(() => {
    // Check if offline ready was previously stored and not dismissed
    const storedOfflineReady = localStorage.getItem('offlineReady');
    const wasDismissed = localStorage.getItem('offlineReadyDismissed');

    if (storedOfflineReady === 'true' && wasDismissed !== 'true') {
      setShowOfflineReady(true);
    }
  }, []);

  // When offlineReady becomes true, store it
  useEffect(() => {
    if (offlineReady) {
      localStorage.setItem('offlineReady', 'true');
      setShowOfflineReady(true);
    }
  }, [offlineReady]);

  const close = () => {
    localStorage.setItem('offlineReadyDismissed', 'true');
    localStorage.setItem('offlineReady', 'false');
    setShowOfflineReady(false);
    setOfflineReady(false);
    setNeedRefresh(false);
  }

  if (!showOfflineReady && !needRefresh) {
    return null;
  }

  return (
    <Card className="fixed bottom-4 right-4 w-80 z-50">
      <CardHeader>
        <CardTitle>{showOfflineReady ? 'App ready to work offline' : 'New content available'}</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{showOfflineReady ? 'The app has been cached and is ready to work offline.' : 'A new version of the app is available. Click the reload button to update.'}</p>
      </CardContent>
      <CardFooter className="flex justify-end gap-2">
        {needRefresh && <Button onClick={() => updateServiceWorker(true)}>Reload</Button>}
        <Button variant="secondary" onClick={() => close()}>Close</Button>
      </CardFooter>
    </Card>
  )
}

export default ReloadPrompt
