-- Custom SQL migration file, put your code below! --
UPDATE `transactions` SET `status` = 'cleared'
WHERE `status` = 'open'
  AND `account_id` IN (SELECT `id` FROM `accounts` WHERE `import_preset` IS NULL AND `column_map` IS NULL);
