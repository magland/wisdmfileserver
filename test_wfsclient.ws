include('wisdmws:/wisdm.ws');
include('wfsclient.ws');

function run() {
	var FS=new WFSClient('realhub.org:8006','fs1','',{initialize:true});
	
	var txt1=FS.readTextFile('test1.txt');
	
	var ret=FS.writeTextFile('test2.txt','This is a file: test2.txt\n');
	//var ret=FS.writeTextFile('dir1/test1.txt','ANOTHER FILE\n');
	
	var txt2=FS.readTextFile('test2.txt');
	var txt3=FS.readTextFile('dir1/test1.txt');
	console.log ('txt1='+txt1,'txt2='+txt2,'txt3='+txt3);
	
	var tmp=FS.readDir('');
	console.log (tmp);
	
	var tmp2=FS.readDir('dir1');
	console.log (tmp2);
	
	var X=FS.loadFile('test1.txt');
	
	BEGIN_PROCESS bash []=test_file(file X)
	cat $X
	END_PROCESS
	
	FS.saveFile('test1_saved.txt',X);
	
	console.log(FS.readTextFile('test1_saved.txt'));
}


