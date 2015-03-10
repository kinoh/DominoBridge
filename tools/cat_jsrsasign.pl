
my @files = (
	"../jsrsasign/myheader.js",
	"../jsrsasign/cryptojs/core-min.js",
	"../jsrsasign/cryptojs/sha1.js",
	"../jsrsasign/jsbn/prng4.js",
	"../jsrsasign/jsbn/rng.js",
	"../jsrsasign/jsbn/jsbn.js",
	"../jsrsasign/jsbn/jsbn2.js",
	"../jsrsasign/jsbn/rsa.js",
	"../jsrsasign/jsbn/rsa2.js",
	"../jsrsasign/crypto-1.1.js",
	"../jsrsasign/rsasign-1.2.js"
	);

foreach $f(@files)
{
	open F, $f;

	my $fn = substr($f, rindex($f, "/") + 1);

	if ($fn ne "myheader.js")
	{
		print "\n";
		print "/*******************************/\n";
		print "/* $fn" . (" " x (27 - length($fn))) . " */\n";
		print "/*******************************/\n";
		print "\n";
	}

	while (<F>)
	{
		print;
	}

	print ("\n" x 4) unless ($f eq $files[$#files]);

	close F;
}
