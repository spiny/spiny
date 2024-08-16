package model

import (
	"time"

	"gorm.io/gorm"
)


type AuthUser struct {
  gorm.Model
  UserID string `gorm:"uniqueIndex"`
  FirstName string
  LastName string
  Email string
  AvatarURL string
  AccessToken string
  AccessTokenSecret string
  RefreshToken string
  ExpiresAt time.Time
}


// TableName overrides the table name used by User to `profiles`
func (AuthUser) TableName() string {
  return "auth_users"
}
