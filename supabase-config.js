window.JACHTSEIZOEN_SUPABASE = {
  url: "https://ghtaodvppcuztwbdufpg.supabase.co",
  publishableKey: "sb_publishable_TgeWkOYF_mLazGCMuEkEKQ_hEZ1P0Sn"
};

window.supabaseClient = window.supabase.createClient(
  window.JACHTSEIZOEN_SUPABASE.url,
  window.JACHTSEIZOEN_SUPABASE.publishableKey
);
