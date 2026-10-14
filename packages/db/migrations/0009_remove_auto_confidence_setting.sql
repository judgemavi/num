-- Custom SQL migration file, put your code below! --
DELETE FROM `settings` WHERE `key` = 'autoConfidence';
