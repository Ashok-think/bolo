import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Business } from '@/lib/types';

export function useBusiness(userId: string | undefined) {
  const [business, setBusiness] = useState<Business | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!userId) {
      setBusiness(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .maybeSingle();

    if (!error && data) {
      setBusiness(data as Business);
    } else {
      setBusiness(null);
    }
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { business, loading, refresh, setBusiness };
}
