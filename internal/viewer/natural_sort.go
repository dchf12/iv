package viewer

import (
	"sort"
	"strings"
	"unicode"
)

// naturalLess は2つの文字列をNatural Sort（自然順）で比較する。
// 文字列中の連続した数字部分を数値として比較し、
// それ以外の部分は大文字小文字を無視して辞書順で比較する。
func naturalLess(a, b string) bool {
	ia, ib := 0, 0
	for ia < len(a) && ib < len(b) {
		ca := rune(a[ia])
		cb := rune(b[ib])

		aIsDigit := unicode.IsDigit(ca)
		bIsDigit := unicode.IsDigit(cb)

		if aIsDigit && bIsDigit {
			// 両方が数字: 数値として比較
			// 先頭のゼロをスキップして数字部分を抽出
			ja := ia
			for ja < len(a) && a[ja] >= '0' && a[ja] <= '9' {
				ja++
			}
			jb := ib
			for jb < len(b) && b[jb] >= '0' && b[jb] <= '9' {
				jb++
			}

			numA := a[ia:ja]
			numB := b[ib:jb]

			// 先頭ゼロを除去して比較
			strippedA := strings.TrimLeft(numA, "0")
			strippedB := strings.TrimLeft(numB, "0")

			if len(strippedA) != len(strippedB) {
				return len(strippedA) < len(strippedB)
			}
			if strippedA != strippedB {
				return strippedA < strippedB
			}
			// 数値が同じなら先頭ゼロが多い方を先に（安定性）
			if len(numA) != len(numB) {
				return len(numA) > len(numB)
			}

			ia = ja
			ib = jb
			continue
		}

		// 大文字小文字を無視して比較（Finder互換）
		la := unicode.ToLower(ca)
		lb := unicode.ToLower(cb)

		if la != lb {
			return la < lb
		}

		ia++
		ib++
	}

	return len(a) < len(b)
}

// sortNatural は文字列スライスをNatural Sortで並び替える。
func sortNatural(paths []string) {
	sort.Slice(paths, func(i, j int) bool {
		return naturalLess(paths[i], paths[j])
	})
}
