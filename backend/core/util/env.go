package util

import (
	"os"
	"strings"
)

// GetEnv 获取环境变量，如果为空则返回回退值，并自动处理首尾空格。
func GetEnv(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
