-- =========================================================
-- Team Skribbl — Starter word list
-- Edit freely, add your own team in-jokes, run again any time.
-- =========================================================

insert into words (word, difficulty, category) values
  ('umbrella', 'easy', 'general'),
  ('robot', 'easy', 'general'),
  ('bicycle', 'easy', 'general'),
  ('sandwich', 'easy', 'general'),
  ('rainbow', 'easy', 'general'),
  ('guitar', 'easy', 'general'),
  ('spaceship', 'medium', 'general'),
  ('volcano', 'medium', 'general'),
  ('dinosaur', 'medium', 'general'),
  ('waterfall', 'medium', 'general'),
  ('lighthouse', 'medium', 'general'),
  ('scarecrow', 'medium', 'general'),
  ('helicopter', 'medium', 'general'),
  ('avalanche', 'hard', 'general'),
  ('constellation', 'hard', 'general'),
  ('kaleidoscope', 'hard', 'general'),
  ('procrastination', 'hard', 'general'),
  ('merger', 'medium', 'work'),
  ('deadline', 'easy', 'work'),
  ('standup meeting', 'medium', 'work'),
  ('coffee break', 'easy', 'work'),
  ('quarterly report', 'hard', 'work'),
  ('out of office', 'medium', 'work'),
  ('conference call', 'medium', 'work')
on conflict do nothing;
