WITH ranked AS (
  SELECT id, (row_number() OVER (ORDER BY sort_key, name, id) - 1) % 12 AS position
  FROM category_groups
)
UPDATE category_groups
SET color = CASE (SELECT position FROM ranked WHERE ranked.id = category_groups.id)
  WHEN 0 THEN 'sky'
  WHEN 1 THEN 'ocean'
  WHEN 2 THEN 'lilac'
  WHEN 3 THEN 'plum'
  WHEN 4 THEN 'pink'
  WHEN 5 THEN 'amber'
  WHEN 6 THEN 'butter'
  WHEN 7 THEN 'olive'
  WHEN 8 THEN 'mint'
  WHEN 9 THEN 'teal'
  WHEN 10 THEN 'cyan'
  WHEN 11 THEN 'slate'
END;
