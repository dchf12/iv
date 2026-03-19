package viewer

import (
	"testing"
)

func TestNaturalLess(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		a, b string
		want bool
	}{
		"simple numeric order": {
			a: "1.png", b: "2.png", want: true,
		},
		"numeric vs lexicographic": {
			a: "2.png", b: "10.png", want: true,
		},
		"same number": {
			a: "10.png", b: "10.png", want: false,
		},
		"reverse numeric": {
			a: "10.png", b: "2.png", want: false,
		},
		"prefix with number": {
			a: "IMG001.png", b: "IMG002.png", want: true,
		},
		"prefix with large gap": {
			a: "IMG003.png", b: "IMG010.png", want: true,
		},
		"case insensitive": {
			a: "abc.png", b: "ABC.png", want: false,
		},
		"mixed text and numbers": {
			a: "file2part3.txt", b: "file2part12.txt", want: true,
		},
		"leading zeros equal value": {
			a: "01.png", b: "1.png", want: true,
		},
		"different text prefix": {
			a: "a1.png", b: "b1.png", want: true,
		},
		"empty strings": {
			a: "", b: "1.png", want: true,
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if got := naturalLess(test.a, test.b); got != test.want {
				t.Fatalf("naturalLess(%q, %q) = %v; want %v", test.a, test.b, got, test.want)
			}
		})
	}
}

func TestSortNatural(t *testing.T) {
	t.Parallel()
	tests := map[string]struct {
		input    []string
		expected []string
	}{
		"numeric filenames": {
			input:    []string{"1.png", "10.png", "11.png", "2.png", "21.png", "3.png"},
			expected: []string{"1.png", "2.png", "3.png", "10.png", "11.png", "21.png"},
		},
		"prefixed filenames": {
			input:    []string{"IMG010.png", "IMG001.png", "IMG003.png", "IMG002.png", "IMG011.png"},
			expected: []string{"IMG001.png", "IMG002.png", "IMG003.png", "IMG010.png", "IMG011.png"},
		},
		"mixed types": {
			input:    []string{"z.png", "a2.png", "a10.png", "a1.png"},
			expected: []string{"a1.png", "a2.png", "a10.png", "z.png"},
		},
		"already sorted": {
			input:    []string{"1.png", "2.png", "3.png"},
			expected: []string{"1.png", "2.png", "3.png"},
		},
		"single element": {
			input:    []string{"only.png"},
			expected: []string{"only.png"},
		},
	}

	for name, test := range tests {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			input := make([]string, len(test.input))
			copy(input, test.input)
			sortNatural(input)
			for i, got := range input {
				if got != test.expected[i] {
					t.Fatalf("sortNatural(%v) = %v; want %v", test.input, input, test.expected)
				}
			}
		})
	}
}
